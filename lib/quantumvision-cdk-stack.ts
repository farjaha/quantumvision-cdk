import { Stack, StackProps, Aws, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  aws_iam as iam,
  aws_kms as kms,
  aws_cognito as cognito,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_ec2 as ec2,
  aws_s3objectlambda as s3ObjectLambda,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

// configurable variables
const S3_ACCESS_POINT_NAME = 's3-ap';
const OBJECT_LAMBDA_ACCESS_POINT_NAME_PREFIX = 's3-object-lambda-ap-';
const BUCKET_NAME = 'qv-shared-files';
const USER_POOL_NAME = 'QVUserPool';
const USER_POOL_CLIENT_NAME = 'QVClient';
const allowedIPs = ['68.252.124.59'];

// The main stack to provision the quantum vision's share file infrastructure
export class QuantumvisionCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 access point arn that we will use as a part of s3 object lambda
    const accessPoint = `arn:aws:s3:${Aws.REGION}:${Aws.ACCOUNT_ID}:accesspoint/${S3_ACCESS_POINT_NAME}`;

    // List of clearance levels that will be used for naming the access points and lambda functions
    const clearanceLevels = ['secret', 'sensitive', 'topsecret'];

    // Create the userpool with all required configs
    const userPool = new cognito.UserPool(this, 'QVUserPool', {
      userPoolName: USER_POOL_NAME,
      selfSignUpEnabled: false,
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          mutable: true,
          required: true,
        },
      },
      customAttributes: {
        'clearance_level': new cognito.StringAttribute(),
        'team': new cognito.StringAttribute(),
      },
      removalPolicy: RemovalPolicy.DESTROY,
      signInAliases: {
        email: true,
      },
    });

    // Create User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPoolClientName: USER_POOL_CLIENT_NAME,
      userPool: userPool,
      refreshTokenValidity: Duration.hours(24),
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // S3 Bucket to store shared files
    const bucket = new s3.Bucket(this, 'SharedBucket', {
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      bucketName: BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: new kms.Key(this, 's3BucketKMSKey'),
      enforceSSL: true,
      versioned: true,
      objectLockEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    //Lifecycle policy to to preserve data for seven years with frequent access during first three months
    bucket.addLifecycleRule({
      transitions: [{
        storageClass: s3.StorageClass.INTELLIGENT_TIERING,
        transitionAfter: Duration.days(90),
      },
      {
        storageClass: s3.StorageClass.GLACIER,
        transitionAfter: Duration.days(365),
      }],
      expiration: Duration.days(2555),
    });

    // Delegating access control to access points
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-policies.html
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['*'],
        principals: [new iam.AnyPrincipal()],
        resources: [bucket.bucketArn, bucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            's3:DataAccessPointAccount': `${Aws.ACCOUNT_ID}`,
          },
        },
      })
    );

    // Lambda layer to share the required libraries among lambda functions
    const qv_layer = new lambda.LayerVersion(this, 'QVLayer', {
      layerVersionName: 'qv-layer',
      code: lambda.Code.fromAsset('./csv-layer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
    });

    // Lambda function to handle the file download and choose the currect access point
    const downloadLambda = new lambda.Function(this, 'DownloadLambda', {
      functionName: 'qv-downlodLambdaFunction',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'download-lambda.handler',
      code: lambda.Code.fromAsset('resources/retrieve-transformed-object-lambda/helper_functions'),
      layers: [qv_layer],
      timeout: Duration.seconds(50),
    });

    bucket.grantRead(downloadLambda);

    const clearanceToFunctionMap = new Map<string, lambda.Function>();

    // Creating lambda functions to handle the redaction logic for each different clearance level
    clearanceLevels.forEach(clearance => {
      const retrieveLambda = new lambda.Function(this, `RetrieveTransformedObjectLambda${clearance}`, {
        functionName: `qv-s3ObjectLambdaFunction${clearance}`,
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: `lambda-${clearance}.handler`,
        code: lambda.Code.fromAsset('resources/retrieve-transformed-object-lambda'),
        layers: [qv_layer],
      });

      retrieveLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: ['*'],
          actions: ['s3-object-lambda:WriteGetObjectResponse'],
        })
      );

      bucket.grantRead(retrieveLambda);

      // Object lambda access points for each clearance level
      new s3ObjectLambda.CfnAccessPoint(this, `S3ObjectLambdaAP${clearance.toLocaleUpperCase()}`, {
        name: `s3-object-lambda-ap-${clearance}`,
        objectLambdaConfiguration: {
          supportingAccessPoint: accessPoint,
          transformationConfigurations: [
            {
              actions: ['GetObject'],
              contentTransformation: {
                'AwsLambda': {
                  'FunctionArn': retrieveLambda.functionArn,
                },
              },
            },
          ],
        },
      });

      downloadLambda.addEnvironment(`OBJECT_LAMBDA_AP_${clearance.toLocaleUpperCase()}`, `arn:aws:s3-object-lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:accesspoint/${OBJECT_LAMBDA_ACCESS_POINT_NAME_PREFIX}${clearance}`);

      clearanceToFunctionMap.set(clearance, retrieveLambda);

    });

    // Associate Bucket's access point with lambda get access
    const policyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowLambdaToUseAccessPoint',
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          principals: [
            new iam.ArnPrincipal(<string>clearanceToFunctionMap.get('secret')!.role?.roleArn),
            new iam.ArnPrincipal(<string>clearanceToFunctionMap.get('sensitive')!.role?.roleArn),
            new iam.ArnPrincipal(<string>clearanceToFunctionMap.get('topsecret')!.role?.roleArn)
          ],
          resources: [`${accessPoint}/object/*`]
        })
      ]
    });

    // S3 access point
    new s3.CfnAccessPoint(this, 'exampleBucketAP', {
      bucket: bucket.bucketName,
      name: S3_ACCESS_POINT_NAME,
      policy: policyDoc
    });

    clearanceToFunctionMap.forEach(retriveLambda => {
      retriveLambda.grantInvoke(downloadLambda);
    });

    downloadLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['s3:GetObject', 's3-object-lambda:GetObject'],
      })
    );

    const lambdaIntegration = new apigateway.LambdaIntegration(downloadLambda);

    // Create a resource policy for api gateway
    const apiResourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['execute-api:Invoke'],
          principals: [new iam.ArnPrincipal('*')],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.ArnPrincipal('*')],
          actions: ['execute-api:Invoke'],
          resources: ['*'],
          conditions: {
            'NotIpAddress': {
              "aws:SourceIp": allowedIPs
            }
          }
        })
      ]
    });

    const api = new apigateway.RestApi(this, 'QV-api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
      },
      deployOptions: {
        stageName: 'dev',
        tracingEnabled: true,
      },
      policy: apiResourcePolicy,
    });

    const apiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'QV-Authorizer',
    });

    const download = api.root.addResource('download-files');
    download.addMethod('POST', lambdaIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });


    const listLambdaFunction = new lambda.Function(this, 'ListLambda', {
      functionName: 'qv-listLambdaFunction',
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('resources/retrieve-transformed-object-lambda/helper_functions'),
      handler: 'list-lambda.handler',
      timeout: Duration.seconds(50),
      memorySize: 256,
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    bucket.grantRead(listLambdaFunction);
    const listLambdaIntegration = new apigateway.LambdaIntegration(listLambdaFunction);
    const files = api.root.addResource('qv-files');
    files.addMethod('POST', listLambdaIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }
}








// Create a vpc for lambda
    // const vpc = new ec2.Vpc(this, 'LambdaVpc', {
    //   vpcName: 'qv-lambdaVpc',
    //   ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
    //   subnetConfiguration: [
    //     {
    //       cidrMask: 24,
    //       name: 'PrivateSubnet',
    //       subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //     },
    //     {
    //       cidrMask: 24,
    //       name: 'PublicSubnet',
    //       subnetType: ec2.SubnetType.PUBLIC,
    //     }
    //   ]
    // });

    // Creating lambda functions to handle the redaction logic for each different clearance level
    // clearanceLevels.forEach(clearance => {
    //   const retrieveLambda = new lambda.Function(this, `RetrieveTransformedObjectLambda${clearance}`, {
    //     functionName: `qv-s3ObjectLambdaFunction${clearance}`,
    //     runtime: lambda.Runtime.NODEJS_14_X,
    //     handler: `lambda-${clearance}.handler`,
    //     code: lambda.Code.fromAsset('resources/retrieve-transformed-object-lambda'),
    //     layers: [qv_layer],
        // vpc: vpc,
        // vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      // });
