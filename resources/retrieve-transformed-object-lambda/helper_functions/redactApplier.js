const aws = require('aws-sdk');
const s3 = new aws.S3();
const { processAndRedactData } = require('./dataProcessor');

async function redactApplier(event, redactFields) {

    const responseParams = await processAndRedactData(event, redactFields);

    return s3.writeGetObjectResponse(responseParams).promise();
}

module.exports = { redactApplier };