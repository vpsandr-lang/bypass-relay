const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const initSqlJs = require('sql.js');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== База данных ======
let db;
async function initDb() {
  const SQL = await initSqlJs();
  // Try to load existing DB
  const dbPath = path.join(__dirname, 'data', 'appointments.db');
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    service_type TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS consultation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    question TEXT,
    answer TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  saveDb();
}
function saveDb() {
  const dbPath = path.join(__dirname, 'data', 'appointments.db');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// ====== Ollama LLM ======
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen2.5:3b';
// ====== Авто-выбор модели Ollama ======
const PREFERRED_MODELS = ['qwen2.5:3b', 'qwen2.5:7b', 'llama3.2:3b', 'llama3.1:8b', 'mixtral:8x7b'];

async function detectBestModel() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    const availableModels = (data.models || []).map(m => m.name);
    
    for (const preferred of PREFERRED_MODELS) {
      if (availableModels.includes(preferred)) {
        console.log(`📡 Используется модель: ${preferred}`);
        return preferred;
      }
    }
    
    if (availableModels.length > 0) {
      console.log(`📡 Используется доступная модель: ${availableModels[0]}`);
      return availableModels[0];
    }
    
    console.log('⚠️  Модели Ollama не найдены. Будут использованы fallback-ответы.');
    return LLM_MODEL; // fallback to env default
  } catch (err) {
    console.log('⚠️  Ollama не отвечает. Будут использованы fallback-ответы.');
    return LLM_MODEL;
  }
}

const SYSTEM_PROMPT = `Ты — Елена, виртуальный офис-менеджер нотариальной конторы "Нотариус+". 
Твоя задача — консультировать посетителей по следующим вопросам:
1. Услуги нотариуса (заверение документов, доверенности, завещания, договоры купли-продажи, наследство)
2. Запись на прием к нотариусу
3. Стоимость услуг
4. Необходимые документы для совершения нотариальных действий
5. Режим работы конторы

Ты общаешься приветливо, профессионально, на русском языке. 
Отвечай кратко и по делу. Если посетитель хочет записаться на прием, уточни:
- ФИО
- Желаемую дату и время
- Тип услуги
- Телефон для связи

Не выдумывай информацию о ценах и услугах, если не уверена — предложи уточнить у нотариуса.`;


// ====== Fallback ответы (когда Ollama недоступен) ======
const FALLBACK_RESPONSES = [
  { keywords: ['услуг', 'предоставляете', 'делаете', 'помощь', 'можно'], response: 'Наша нотариальная контора предоставляет следующие услуги: заверение документов и копий, оформление доверенностей, составление и удостоверение завещаний, оформление наследства, удостоверение договоров купли-продажи, брачных договоров, согласий на выезд детей, а также юридические консультации по нотариальным вопросам.' },
  { keywords: ['цен', 'стоим', 'сколько', 'дорого', 'плат'], response: 'Стоимость услуг зависит от типа нотариального действия и рассчитывается согласно тарифам, установленным законодательством РФ. Рекомендую обратиться к нотариусу для точного расчёта стоимости конкретной услуги. Примерный диапазон: заверение копий — от 100 рублей, доверенности — от 1500 рублей.' },
  { keywords: ['документ', 'доверенност', 'какие нужн'], response: 'Для оформления доверенности необходим паспорт, данные доверителя и доверенного лица (ФИО, паспортные данные), а также текст доверенности. Для некоторых видов доверенностей могут потребоваться дополнительные документы.' },
  { keywords: ['завещани', 'наследств'], response: 'Для составления завещания необходим паспорт и правоустанавливающие документы на имущество. Наследственные дела требуют свидетельства о смерти, документы, подтверждающие родство, и правоустанавливающие документы на наследственное имущество.' },
  { keywords: ['записат', 'запишите', 'приём', 'прием'], response: 'Я могу записать вас на приём к нотариусу! Для этого заполните форму записи (нажмите кнопку "Записаться"). Укажите ваше ФИО, желаемую дату и время, а также тип услуги. Наш нотариус примет вас в назначенное время.' },
  { keywords: ['режим', 'работ', 'часы', 'открыт', 'адрес', 'найти'], response: 'Наша нотариальная контора работает с понедельника по пятницу с 9:00 до 18:00, перерыв с 13:00 до 14:00. Суббота: с 10:00 до 16:00. Воскресенье — выходной. Адрес: ул. Ленина, д. 15, офис 5.' },
  { keywords: ['здравствуй', 'привет', 'добрый'], response: 'Здравствуйте! Рада вас приветствовать в нашей нотариальной конторе! Чем я могу вам помочь? Я могу проконсультировать по услугам, ценам, необходимым документам или записать на приём к нотариусу.' },
];

function findFallbackResponse(message) {
  const msg = message.toLowerCase();
  for (const item of FALLBACK_RESPONSES) {
    if (item.keywords.some(k => msg.includes(k))) {
      return item.response;
    }
  }
  return null;
}


async function queryLLM(messages) {
  const model = global.LLM_MODEL || LLM_MODEL;
  // Проверяем fallback ответы для常见ных вопросов
  const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const fallback = findFallbackResponse(lastUserMsg);
  
  try {
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-10)
    ];
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: fullMessages,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const data = await response.json();
    
    // Если Ollama вернул ошибку или модель не готова
    if (data.error || !data.message?.content) {
      console.warn('Ollama вернул ошибку:', data.error || 'пустой ответ');
      return fallback || 'Извините, временно не могу ответить. Пожалуйста, позвоните нам по телефону +7 (999) 123-45-67.';
    }
    
    return data.message.content;
  } catch (err) {
    console.error('LLM error:', err.message);
    return fallback || 'Извините, сервис временно недоступен. Пожалуйста, попробуйте позже или обратитесь к нотариусу по телефону.';
  }
}

// ====== API Routes ======

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ollama_model: global.LLM_MODEL || LLM_MODEL });
});

// Chat with LLM
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  
  const messages = [...(history || []), { role: 'user', content: message }];
  const answer = await queryLLM(messages);
  
  // Log consultation
  const stmt = db.prepare('INSERT INTO consultation_log (session_id, question, answer) VALUES (?, ?, ?)');
  stmt.run([uuidv4(), message, answer]);
  saveDb();
  
  res.json({ answer });
});

// Get appointments
app.get('/api/appointments', (req, res) => {
  const stmt = db.prepare('SELECT * FROM appointments ORDER BY date, time');
  const appointments = stmt.getAsObject([]);
  // sql.js returns object differently - let me collect rows
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  res.json(rows || []);
});

// Create appointment
app.post('/api/appointments', (req, res) => {
  const { name, phone, email, date, time, service_type, notes } = req.body;
  if (!name || !date || !time) {
    return res.status(400).json({ error: 'Name, date and time required' });
  }
  const id = uuidv4();
  const stmt = db.prepare(
    'INSERT INTO appointments (id, name, phone, email, date, time, service_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run([id, name, phone || '', email || '', date, time, service_type || '', notes || '']);
  saveDb();
  res.json({ id, message: 'Запись создана успешно!' });
});

// Cancel appointment
app.delete('/api/appointments/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM appointments WHERE id = ?');
  stmt.run([req.params.id]);
  saveDb();
  res.json({ message: 'Запись отменена' });
});

// ====== Socket.IO for real-time events ======
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('visitor:detected', (data) => {
    console.log('Visitor detected:', data);
    io.emit('notary:notification', {
      type: 'visitor',
      message: 'Посетитель у стойки'
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ====== Запуск ======
const PORT = process.env.PORT || 3000;

async function start() {
  await initDb();
  const detectedModel = await detectBestModel();
  global.LLM_MODEL = detectedModel;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Виртуальный офис-менеджер запущен на порту ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`🤖 Модель LLM: ${LLM_MODEL}`);
  });
}

start().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});
