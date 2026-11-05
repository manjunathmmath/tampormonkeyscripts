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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
