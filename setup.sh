#!/bin/bash

# ====== Установка виртуального офис-менеджера ======
set -e

echo "🔧 Установка виртуального офис-менеджера для нотариальной конторы"
echo "================================================================"

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не найден. Установите Node.js 18+"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Проверка npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm не найден"
    exit 1
fi
echo "✅ npm $(npm --version)"

# Установка зависимостей
echo ""
echo "📦 Установка зависимостей..."
npm install

# Установка Ollama
if ! command -v ollama &> /dev/null; then
    echo ""
    echo "🔄 Установка Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
fi
echo "✅ Ollama $(ollama --version 2>&1)"

# Запуск Ollama
echo ""
echo "🔄 Запуск Ollama..."
ollama serve &
sleep 2

# Скачивание модели
echo ""
echo "🔄 Скачивание языковой модели (qwen2.5:3b)..."
ollama pull qwen2.5:3b

echo ""
echo "✅ Установка завершена!"
echo ""
echo "🚀 Для запуска выполните:"
echo "   cd $(pwd)"
echo "   node server.js"
echo ""
echo "🌐 Откройте в браузере: http://localhost:3000"
