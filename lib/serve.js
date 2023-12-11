import handler from 'serve-handler';
import http from 'node:http';


export default async function serve() {
  const server = http.createServer((request, response) => {
    process.stdout.write(`${request.url}\n`);

    // Serve Rollup-ed JS from 'build'
    if (request.url.match(/\/build\/dicom\.js(\.map)?/)) {
      return handler(request, response);
    }

    // Serve all other files from 'www'
    return handler(request, response, { public: 'www' });
  });

  server.listen(3000, () => {
    process.stdout.write('Browser UI started on http://localhost:3000 - press Ctrl+C to exit\n');
  });

  // Wait until Ctrl+C is pressed, then exit
  return new Promise(resolve => process.on('SIGINT', resolve));
}
