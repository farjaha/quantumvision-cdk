const { getObjectFromS3 } = require('./utils/s3GetUtils');
const { redactData } = require('./utils/redactUtils');
const { createObjectCsvWriter } = require('csv-writer');
const csv = require('csv-parser');

async function parseCsv(csvString) {
    const dataArray = [];
    const stream = csv({
        separator: ',', 
        mapHeaders: ({ header }) => header.trim(), 
    });
    return new Promise((resolve, reject) => {
        stream
            .on('data', (data) => {
                dataArray.push(data);
            })
            .on('end', () => {
                resolve(dataArray);
            })
            .on('error', (error) => {
                reject(error);
            });
        // Feed the CSV data to the stream
        const lines = csvString.split('\n');
        lines.forEach((line) => stream.write(line));
        stream.end();
    });
}

async function processAndRedactData(event, redactFields) {

    const eventObjectContext = event.getObjectContext;
    const s3Url = eventObjectContext.inputS3Url;
    const userrequestUrl = event.userRequest.url;

    // Fetch the data from s3
    const s3Object = await getObjectFromS3(s3Url);
    console.log("s3object from data processor:", s3Object);

    const isCsv = userrequestUrl.endsWith('.csv');

    let dataArray;
    if (isCsv) {
        dataArray = await parseCsv(s3Object);
    } else {
        dataArray = JSON.parse(s3Object);
    }
    
    //Redact the required fields
    console.log("data array from data processor:", dataArray);
    const redactedArray = redactData(dataArray, redactFields);
    console.log("redacted array from data processor:", redactedArray);

    return {
        RequestRoute: eventObjectContext.outputRoute,
        RequestToken: eventObjectContext.outputToken,
        Body: JSON.stringify(redactedArray),
    };
}

module.exports = { processAndRedactData };


// function convertArrayToCsv(dataArray) {
//     // Extract unique headers by recursively flattening the objects
//     const headers = new Set();
//     dataArray.forEach(data => {
//         flattenObject(data, headers);
//     });
//     // Convert headers set to an array
//     const headerArray = Array.from(headers);
//     // Generate CSV header
//     const headerRow = headerArray.join(',') + '\n';
//     // Generate CSV rows
//     const rows = dataArray.map(data => {
//         const row = headerArray.map(header => data[header] || '').join(',');
//         return row;
//     }).join('\n');
//     return headerRow + rows;
// }
// // Function to recursively flatten object keys
// function flattenObject(obj, result, path = []) {
//     for (const key in obj) {
//         const newPath = path.concat(key);
//         if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
//             flattenObject(obj[key], result, newPath);
//         } else {
//             result.add(newPath.join('/'));
//         }
//     }
// }

// async function processAndRedactData(event, redactFields) {
//     const eventObjectContext = event.getObjectContext;
//     const s3Url = eventObjectContext.inputS3Url;
//     const userrequestUrl = event.userRequest.url;

//     // Fetch the data from s3
//     const s3Object = await getObjectFromS3(s3Url);
//     console.log("s3 object from data processor", s3Object);

//     const isCsv = userrequestUrl.endsWith('.csv');
//     console.log("isCsv: ", isCsv);

//     let dataArray;
//     if (isCsv) {
//         dataArray = await parseCsv(s3Object);
//     } else {
//         dataArray = JSON.parse(s3Object);
//     }
    
//     //Redact the required fields
//     console.log("data array from data processor:", dataArray);
//     const redactedArray = redactData(dataArray, redactFields);
//     console.log("redacted array from data processor:", redactedArray);

//     const csvResult = await convertArrayToCsv(redactedArray);
//     console.log("CSV Result: ", csvResult);
//     const responseBody = isCsv ? convertArrayToCsv(redactedArray): JSON.stringify(redactedArray);

//     return {
//         RequestRoute: eventObjectContext.outputRoute,
//         RequestToken: eventObjectContext.outputToken,
//         Body: JSON.stringify(redactedArray),
//         ContentType: isCsv? 'text/csv' : 'application/json',
//     };
// }

// module.exports = { processAndRedactData };