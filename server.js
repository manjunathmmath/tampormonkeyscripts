const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const path = require('path')
app.use(express.static('static'))
app.get('/', (req, res) => {
  res.send('Hello World!')
})

// Raw market-data recorder (official Kite Connect API only): see recorder.js and docs/ai-data-plan.md
require('./recorder').mount(app, express)

// Expired option contracts for the Replay Recorder, read from the separate fetch tool's files (see expired.js)
require('./expired').mount(app)

// Research lab results saved from the browser (static/autoTrade/researchLab.js)
app.post('/api/research/save', express.json({ limit: '80mb' }), (req, res) => {
  const fs = require('fs'), name = String((req.body || {}).name || '').replace(/[^A-Za-z0-9_-]/g, '')
  if (!name) return res.status(400).json({ error: 'name' })
  const dir = path.join(__dirname, 'data', 'research'); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(req.body.data))
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
