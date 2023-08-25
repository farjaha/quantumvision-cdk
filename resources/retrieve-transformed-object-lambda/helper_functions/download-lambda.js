const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const Papa = require('papaparse');

exports.handler = async (event) => {

    console.log("download event:", JSON.parse(event.body));

    const requiredData = JSON.parse(event.body);
    const team = requiredData.team;
    const clearanceLevel = requiredData.clearance_lavel;
    const filename = requiredData.filename;

    const bucket_secret = process.env.OBJECT_LAMBDA_AP_SECRET;
    const bucket_sensitive = process.env.OBJECT_LAMBDA_AP_SENSITIVE;
    const bucket_top_secret = process.env.OBJECT_LAMBDA_AP_TOP_SECRET;

    try {

        let bucket = bucket_secret;

        if (clearanceLevel === 'sensitive') {
            bucket = bucket_sensitive;
        }

        else if (clearanceLevel === 'topsecret') {
            bucket = bucket_top_secret;
        }

        const fileKey = `${team}/${filename}`;
        const params = {
            Bucket: bucket,
            Key: fileKey
        };

        const data = await s3.getObject(params).promise();

        console.log("I got the data:", data);
        const dataArray = JSON.parse(data.Body.toString('utf-8'));
        console.log("POOOOX ARRAAAAAYYYY:", dataArray);

        let contentType;
        let body;

        if (filename.endsWith('.json')) {
            contentType = 'application/json';
            body = JSON.stringify(dataArray);

        } else if (filename.endsWith('.csv')) {
            contentType = 'text/csv';
            const csvData = Papa.unparse(dataArray);
            body = csvData;
        }

        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${clearanceLevel}-${filename}"`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE',
            },
            body: body,
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