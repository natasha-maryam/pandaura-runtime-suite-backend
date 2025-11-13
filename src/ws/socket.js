// src/ws/socket.js
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

let io;
function setupSocket(server) {
  io = new Server(server, { cors: { origin: '*' }});
  io.on('connection', socket => {
    console.log('ws connected', socket.id);

    socket.on('connect_client', (data)=> {
      console.log('client connect payload', data);
      socket.emit('connect_ack', { clientId: socket.id });
    });

    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', { ts: new Date().toISOString() });
    });

    socket.on('tag_update', (payload) => {
      // broadcast the tag update to other clients
      socket.broadcast.emit('tag_update', payload);
    });

    socket.on('logic_push_request', (payload) => {
      // simple validation hook - in real system call validator
      const ok = true;
      const ack = {
        id: uuidv4(),
        ok,
        timestamp: new Date().toISOString(),
        payload
      };
      socket.emit('logic_push_response', ack);
      // also broadcast to shadow instance(s)
      socket.broadcast.emit('logic_push_request', payload);
    });

    socket.on('disconnect', ()=> console.log('ws disconnected', socket.id));
  });
}

module.exports = { setupSocket };
