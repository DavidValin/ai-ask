const https = require('https');
const http = require('http');

async function fetchMTLs(fetchUrl, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(fetchUrl);

      const requestOptions = {
        stream: options.stream || false,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + (parsedUrl.search || ''),
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.stringify(options.body) : null
      };

      if (options.useMTLS) {
        requestOptions.key = options.key || null;
        requestOptions.cert = options.cert || null;
        requestOptions.ca = options.ca || null;
        requestOptions.rejectUnauthorized = options.rejectUnauthorized !== undefined ? options.rejectUnauthorized : true;
      }

      // console.log(requestOptions)

      const httpModule = options.useMTLS ? https : http;

      const req = httpModule.request(requestOptions, (res) => {
        if (requestOptions.stream) {
          //console.log('\nSTREAM fos this request: ', requestOptions);
          const stream = new ReadableStream({
            start(controller) {
                res.on('data', (chunk) => {
                  controller.enqueue(chunk);
                });
  
                res.on('end', () => {
                    controller.close();
                });
  
                res.on('error', (err) => {
                    controller.error(err);
                });
            }
          });
          resolve(stream);
        } else {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });
    
          res.on('end', () => {
            if (res.headers['content-type'] != 'application/json') {
              resolve(data);
            }
            try {
              const jsonResponse = JSON.parse(data);
              resolve(jsonResponse);
            } catch (error) {
              console.error('Error parsing JSON:', error);
              console.log('JSON was: ', data);
            }
          });
        }
      });

      req.on('error', (error) => {
        console.log(error);
        reject(`Error: ${error.message}`);
      });

      requestOptions.body &&
        req.write(requestOptions.body);

      req.end();
    } catch (e) {
      console.log('errr: ', e);
      reject(e);
    }
  });
}

module.exports = fetchMTLs;
