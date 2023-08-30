const { getObjectFromS3 } = require('./utils/s3GetUtils');
const { redactData } = require('./utils/redactUtils');
const { parseCsv } = require('./utils/parseCsvUtils');

async function processAndRedactData(event, redactFields) {

    const eventObjectContext = event.getObjectContext;
    const s3Url = eventObjectContext.inputS3Url;
    const userrequestUrl = event.userRequest.url;

    // Fetch the data from s3
    const s3Object = await getObjectFromS3(s3Url);

    const isCsv = userrequestUrl.endsWith('.csv');

    let dataArray;
    if (isCsv) {
        dataArray = await parseCsv(s3Object);
    } else {
        dataArray = JSON.parse(s3Object);
    }
    
    //Redact the required fields
    const redactedArray = redactData(dataArray, redactFields);

    return {
        RequestRoute: eventObjectContext.outputRoute,
        RequestToken: eventObjectContext.outputToken,
        Body: JSON.stringify(redactedArray),
    };
}

module.exports = { processAndRedactData };