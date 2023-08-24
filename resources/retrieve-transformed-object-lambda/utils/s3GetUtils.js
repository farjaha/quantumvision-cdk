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

module.exports = { getObjectFromS3 }