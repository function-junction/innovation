require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

app.post('/api/gemini', async (req, res) => {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY;
    const response = await axios.post(API_URL, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});