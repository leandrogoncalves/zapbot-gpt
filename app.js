require('dotenv').config()
const { Configuration, OpenAIApi } = require("openai");
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fileUpload = require('express-fileupload');

const port = process.env.PORT || 8003;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use(fileUpload({
  debug: true
}));

app.get('/', (req, res) => {
  console.log('Rota Raiz: ');
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'zapbot' }),
  puppeteer: { headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ] }
});
  
client.initialize();
  
io.on('connection', function(socket) {
  console.log('conectando......')
  socket.emit('message', 'Conectando...');
  
  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'zapbot QRCode recebido, aponte a câmera  seu celular!');
    });
  });
    
    client.on('ready', () => {
      socket.emit('ready', 'zapbot Dispositivo pronto!');
      socket.emit('message', 'zapbot Dispositivo pronto!');	
      console.log('zapbot Dispositivo pronto');
    });
    
    client.on('authenticated', () => {
      socket.emit('authenticated', 'zapbot Autenticado!');
      socket.emit('message', 'zapbot Autenticado!');
      console.log('zapbot Autenticado');
    });
    
    client.on('auth_failure', function() {
      socket.emit('message', 'zapbot Falha na autenticação, reiniciando...');
      console.error('zapbot Falha na autenticação');
    });
    
    client.on('change_state', state => {
      console.log('zapbot Status de conexão: ', state );
    });
    
    client.on('disconnected', (reason) => {
      socket.emit('message', 'zapbot Cliente desconectado!');
      console.log('zapbot Cliente desconectado', reason);
      client.initialize();
    });
  });
  
const configuration = new Configuration({
  organization: process.env.ORGANIZATION_ID,
  apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

const getDavinciResponse = async (clientText) => {
  const options = {
      model: "text-davinci-003", // Modelo GPT a ser usado
      prompt: clientText, // Texto enviado pelo usuário
      temperature: 1, // Nível de variação das respostas geradas, 1 é o máximo
      max_tokens: 4000 // Quantidade de tokens (palavras) a serem retornadas pelo bot, 4000 é o máximo
  }

  try {
      const response = await openai.createCompletion(options)
      let botResponse = ""
      response.data.choices.forEach(({ text }) => {
          botResponse += text
      })
      return `Chat GPT 🤖\n\n ${botResponse.trim()}`
  } catch (e) {
      return `${e}`
  }
}

const getDalleResponse = async (clientText) => {
  const options = {
      prompt: clientText, // Descrição da imagem
      n: 1, // Número de imagens a serem geradas
      size: "1024x1024", // Tamanho da imagem
  }

  try {
      const response = await openai.createImage(options);
      return response.data.data[0].url
  } catch (e) {
      return `❌ OpenAI Response Error: ${e.response.data.error.message}`
  }
}



  // Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });
  
  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }
  
  const number = req.body.number + '@c.us';
  const message = req.body.message;
  
  console.log('numero: ' + number);
  console.log('message: ' + message);
  
  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});
  
client.on('message', async msg => {
    
    const iaCommands = {
      davinci3: "/bot",
      dalle: "/img"
  }

  const nomeContato = msg._data.notifyName;

  console.log('nome: '+ nomeContato);
  console.log('type: '+ msg.type);
  console.log('body: '+ msg.body);

  let message = msg.body;
  let firstWord = message.substring(0, message.indexOf(" "));
  
  console.log(firstWord);
  console.log(process.env.ORGANIZATION_ID);
  console.log(process.env.OPENAI_KEY);
  console.log(process.env.PHONE_NUMBER);

  switch (firstWord) {
      case iaCommands.davinci3:
          const question = message.substring(message.indexOf(" "));
          console.log(question);
          
          getDavinciResponse(question).then((response) => {
              /*
                * Faremos uma validação no message.from
                * para caso a gente envie um comando
                * a response não seja enviada para
                * nosso próprio número e sim para 
                * a pessoa ou grupo para o qual eu enviei
                */
              console.log(response);
              // client.sendText(message.from === process.env.BOT_NUMBER ? message.to : message.from, response)
              msg.reply(response)
          })
          break;

      case iaCommands.dalle:
      //implementar
          break;
  }
});
  
  
server.listen(port, function() {
  console.log('App running on *: ' + port);
});