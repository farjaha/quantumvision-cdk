import { Stack, StackProps, CfnOutput, Aws, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  aws_iam as iam,
  aws_kms as kms,
  aws_ec2 as ec2,
  aws_cognito as cognito,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_s3objectlambda as s3ObjectLambda,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

// configurable variables
const S3_ACCESS_POINT_NAME = 's3-ap';
const OBJECT_LAMBDA_ACCESS_POINT_NAME = 's3-object-lambda-ap';
const BUCKET_NAME = 'qv-shared-files';
const USER_POOL_NAME = 'QVUserPool';
const USER_POOL_CLIENT_NAME = 'QVClient';
const COGNITO_DOMAIN_PREFIX = 'qv-auth';

export class QuantumvisionCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accessPoint = `arn:aws:s3:${Aws.REGION}:${Aws.ACCOUNT_ID}:accesspoint/${S3_ACCESS_POINT_NAME}`;

    // Create a vpc for lambda
    // const vpc = new ec2.Vpc(this, 'LambdaVpc', {
    //   vpcName: 'qv-lambdaVpc',
    //   ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
    //   subnetConfiguration: [
    //     {
    //       cidrMask: 24,
    //       name: 'PrivateSubnet',
    //       subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    //     }
    //   ]
    // });

    // Create VPC Gateway endpoint
    // const s3Endpoint = vpc.addGatewayEndpoint('S3Endpoint', {
    //   service: ec2.GatewayVpcEndpointAwsService.S3
    // });

    // Create a cognito userpool for authentication
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
          }
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
      },
      oAuth: {
          callbackUrls: ['http://localhost:3000/'],
          logoutUrls: ['http://localhost:3000/logout'],
          flows: {
              implicitCodeGrant: true,
          },
      },
  });

  // Create User Pool Domain
  const userPoolDomain = userPool.addDomain('QVUserPoolDomain', {
      cognitoDomain: {
          domainPrefix: COGNITO_DOMAIN_PREFIX,
      },
  });

    // Set up a bucket
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
          allowedMethods: [
            s3.HttpMethods.GET,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // Delegating access control to access points
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-policies.html
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['*'],
      principals: [new iam.AnyPrincipal()],
      resources: [
        bucket.bucketArn,
        bucket.arnForObjects('*')
      ],
      conditions: {
        'StringEquals':
        {
          's3:DataAccessPointAccount': `${Aws.ACCOUNT_ID}`
        }
      }
    }));

    // lambda to process our objects during retrieval
    const retrieveTransformedObjectLambda = new lambda.Function(this, 'retrieveTransformedObjectLambda', {
      functionName: 'qv-s3ObjectLambdaFunction',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('resources/retrieve-transformed-object-lambda'),
      // vpc: vpc,
      // vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // Object lambda s3 access
    retrieveTransformedObjectLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['s3-object-lambda:WriteGetObjectResponse']
    }
    ));

    bucket.grantRead(retrieveTransformedObjectLambda);

    // Associate Bucket's access point with lambda get access
    const policyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowLambdaToUseAccessPoint',
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          principals: [
            new iam.ArnPrincipal(<string>retrieveTransformedObjectLambda.role?.roleArn)
          ],
          resources: [`${accessPoint}/object/*`]
        })
      ]
    });

    new s3.CfnAccessPoint(this, 'exampleBucketAP', {
      bucket: bucket.bucketName,
      name: S3_ACCESS_POINT_NAME,
      policy: policyDoc
    }
    );

    // Access point to receive GET request and use lambda to process objects
    const objectLambdaAP = new s3ObjectLambda.CfnAccessPoint(this, 's3ObjectLambdaAP', {
      name: OBJECT_LAMBDA_ACCESS_POINT_NAME,
      objectLambdaConfiguration: {
        supportingAccessPoint: accessPoint,
        transformationConfigurations: [{
          actions: ['GetObject'],
          contentTransformation: {
            'AwsLambda': {
              'FunctionArn': `${retrieveTransformedObjectLambda.functionArn}`
            }
          }
        }]
      }
    }
    );

    // lambda to process our objects during retrieval
    const downloadObjectLambda = new lambda.Function(this, 'DownloadObjectLambda', {
      functionName: 'qv-downlodLambdaFunction',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'download.handler',
      code: lambda.Code.fromAsset('resources/helper'),
      environment: {
        OBJECT_LAMBDA_AP: objectLambdaAP.attrArn,
      }
    });

    bucket.grantRead(downloadObjectLambda);
    retrieveTransformedObjectLambda.grantInvoke(downloadObjectLambda);
    downloadObjectLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        "s3:GetObject",
        "s3-object-lambda:GetObject"
      ],
    }))

    const lambdaIntegration = new apigateway.LambdaIntegration(downloadObjectLambda);

    const api = new apigateway.RestApi(this, 'QV-api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent'],
      },
      deployOptions: {
        stageName: "dev",
        tracingEnabled: true
      }
    });

    // Add authentication to api gateway
    const apiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'QV-Authorizer',
    });

    const download = api.root.addResource('download');
    // download.addMethod('GET', lambdaIntegration, {
    //   authorizer: apiAuthorizer,
    //   authorizationType: apigateway.AuthorizationType.COGNITO,
    // });

    download.addMethod('POST', lambdaIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Files list lambda
    const listLambdaFunction = new lambda.Function(this, 'ListLambda', {
      functionName: 'qv-listLambdaFunction',
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('resources/helper'),
      handler: 'list.handler',
      timeout: Duration.seconds(50),
      memorySize: 256,
      environment: {
        BUCKET_NAME: bucket.bucketName,
      }
    });
    bucket.grantRead(listLambdaFunction);

    const listLambdaIntegration = new apigateway.LambdaIntegration(listLambdaFunction);
    const files = api.root.addResource('qvFiles');
    files.addMethod('GET', listLambdaIntegration, {
      authorizer: apiAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    new CfnOutput(this, 'exampleBucketArn', { value: bucket.bucketArn });
    new CfnOutput(this, 'objectLambdaArn', { value: retrieveTransformedObjectLambda.functionArn });
    new CfnOutput(this, 'objectLambdaAccessPointArn', { value: objectLambdaAP.attrArn });
    new CfnOutput(this, 'objectLambdaAccessPointUrl', {
      value: `https://console.aws.amazon.com/s3/olap/${Aws.ACCOUNT_ID}/${OBJECT_LAMBDA_ACCESS_POINT_NAME}?region=${Aws.REGION}`
    });
  }
}
