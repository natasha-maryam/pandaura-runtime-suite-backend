// src/server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { setupSocket } = require('./ws/socket');
const logicRoutes = require('./routes/logic');
const tagRoutes = require('./routes/tags');
const simulateRoutes = require('./routes/simulate');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/logic', logicRoutes);
app.use('/tags', tagRoutes);
app.use('/simulate', simulateRoutes);

app.get('/', (req,res)=> res.send({ok:true, version:'milestone-2-backend'}));

const server = http.createServer(app);
setupSocket(server);

const PORT = process.env.PORT || 8080;
server.listen(PORT, ()=> console.log(`Server listening ${PORT}`));
