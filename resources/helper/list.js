const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
    try {
        console.log(event);

        // const stringParameters = event.queryStringParameters;
        // if (!stringParameters) {
        //     return {
        //         statusCode: 400,
        //         body: JSON.stringify({ message: 'file name is missing!' }),
        //     };
        // }

        // const team = event.queryStringParameters.team;
        // const prefix = `${team}/`
        const params = { 
            Bucket: process.env.BUCKET_NAME ,
            // Prefix: prefix
        };
        const data = await s3.listObjects(params).promise();

        const fileList = data.Contents.map((object) => object.Key);

        const response = {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE',
            },
            body: JSON.stringify(fileList),
        }

        return response;

    } catch (error) {
        console.log('Error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify('An Error occured while listing files'),
        }
    }
}