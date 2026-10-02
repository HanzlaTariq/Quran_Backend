/** Test-only in-memory SMTP collector. Never imported by the application.
 * Binds loopback, performs no external delivery and has no HTTP/admin interface.
 */
import {createServer} from 'node:net';
export async function localSmtp(port=2526){
 const messages=[],sockets=new Set();
 const server=createServer(socket=>{
  sockets.add(socket);socket.setEncoding('utf8');let pending='',data=false,lines=[],to=[],sender='';
  socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.write('220 localhost Noor integration collector\r\n');
  socket.on('data',chunk=>{pending+=chunk;if(pending.length>1048576)return socket.destroy();let at;
   while((at=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+2);
    if(data){if(line==='.') {messages.push({sender,to:[...to],text:lines.join('\n')});lines=[];data=false;socket.write('250 accepted for test capture\r\n');}else lines.push(line.startsWith('..')?line.slice(1):line);continue;}
    if(/^EHLO|^HELO/i.test(line))socket.write('250-localhost\r\n250-8BITMIME\r\n250 SIZE 1048576\r\n');
    else if(/^MAIL FROM:/i.test(line)){sender=line.slice(10).trim();to=[];socket.write('250 sender ok\r\n');}
    else if(/^RCPT TO:/i.test(line)){to.push(line.slice(8).trim().replace(/^<|>$/g,'').toLowerCase());socket.write('250 recipient ok\r\n');}
    else if(/^DATA$/i.test(line)){data=true;lines=[];socket.write('354 end with a single dot\r\n');}
    else if(/^QUIT$/i.test(line)){socket.end('221 goodbye\r\n');}
    else if(/^RSET|^NOOP/i.test(line)){to=[];lines=[];socket.write('250 ok\r\n');}
    else socket.write('502 unsupported test command\r\n');
   }
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {messages,latestCode(email){const m=messages.filter(x=>x.to.includes(email.toLowerCase())).at(-1);if(!m)throw new Error('No verification email was received by the local SMTP collector. Check .env.testing.');const code=m.text.match(/(?:verification code is|new code is):\s*(\d{6})/i)?.[1];if(!code)throw new Error('The captured verification email does not contain a six-digit code.');return code;},async close(){for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}};
}
