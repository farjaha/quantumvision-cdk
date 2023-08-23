const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {

    console.log("download event:", JSON.parse(event.body));

    const requiredData = JSON.parse(event.body);
    const team = requiredData.team;
    const clearanceLevel = requiredData.clearance_lavel;
    const filename = requiredData.filename;

    const bucket_secret = process.env.OBJECT_LAMBDA_AP_SECRET.toLocaleLowerCase();
    const bucket_sensitive = process.env.OBJECT_LAMBDA_AP_SENSITIVE.toLocaleLowerCase();
    const bucket_top_secret = process.env.OBJECT_LAMBDA_AP_TOP_SECRET.toLocaleLowerCase();
    
    try {

        let bucket = bucket_secret;

        if (clearanceLevel === 'sensitive') {
            bucket = bucket_sensitive;
        }

        else if (clearanceLevel === 'topsecret') {
            bucket = bucket_top_secret;
        }

        const params = {
            Bucket: bucket,
            Key: filename
        };

        const data = await s3.getObject(params).promise();
        const dataArray = JSON.parse(data.Body.toString('utf-8'));

        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${clearanceLevel}-${filename}"`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE',
            },
            body: JSON.stringify(dataArray),
        };
        return response;
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error retrieving the file' }),
            headers: {
                'Content-Type': 'application/json'
            }
        };
    }
};