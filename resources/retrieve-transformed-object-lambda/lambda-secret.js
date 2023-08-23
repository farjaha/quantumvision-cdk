const aws = require('aws-sdk');
const s3 = new aws.S3();
const https = require('https');

function getObjectFromS3(s3Url) {
    return new Promise((resolve, reject) => {
        const req = https.get(s3Url, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error('statusCode=' + res.statusCode));
            }
            let body = [];
            res.on('data', function (chunk) {
                body.push(chunk);
            });
            res.on('end', function () {
                try {
                    body = Buffer.concat(body).toString();
                } catch (e) {
                    reject(e);
                }
                resolve(body);
            });
        });

        req.on('error', (e) => {
            reject(e.message);
        });

        req.end();
    });
}

const handler = async function (event, context) {
    console.log(JSON.stringify(event, undefined, 2));

    const eventObjectContext = event.getObjectContext;
    const s3Url = eventObjectContext.inputS3Url;

    const s3Object = await getObjectFromS3(s3Url);

    const dataArray = JSON.parse(s3Object);
    const redactFields = ["email", "phone", "address", "company", "gender"];
    const redactedArray = dataArray.map((item) => {
        const redactedItem = { ...item };
        for (const field of redactFields) {
            if (redactedItem[field] !== undefined) {
                const fieldValue = String(redactedItem[field]);
                redactedItem[field] = '*'.repeat(fieldValue.length);
            }
        }
        return redactedItem;
    });

    return s3.writeGetObjectResponse({
        RequestRoute: eventObjectContext.outputRoute,
        RequestToken: eventObjectContext.outputToken,
        Body: JSON.stringify(redactedArray),
    }).promise();
};


module.exports = { handler }