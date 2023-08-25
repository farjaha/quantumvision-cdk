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

module.exports = { parseCsv }