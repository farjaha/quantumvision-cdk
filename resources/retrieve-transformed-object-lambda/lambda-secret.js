const aws = require('aws-sdk');
const s3 = new aws.S3();
const { processAndRedactData } = require('./helper_functions/dataProcessor');

const redactFields = ["email", "phone", "address", "company"];

const handler = async function (event, context) {
    console.log(JSON.stringify(event, undefined, 2));

    const responseParams = await processAndRedactData(event, redactFields);

    return s3.writeGetObjectResponse(responseParams).promise();
};


module.exports = { handler };