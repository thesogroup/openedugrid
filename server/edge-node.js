const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

const syncedSubmissions = [];

app.post('/api/sync/queue', (req, res) => {
  const { id, actionType, payload, timestamp, hash } = req.body;
  const clientSignature = req.headers['x-openedugrid-signature'];

  if (clientSignature !== 'S.O.GROUP-VERIFIED') {
    return res.status(401).json({ status: 'ERROR', message: 'Invalid cryptographic signature badge.' });
  }

  const computedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ actionType, payload, timestamp }))
    .digest('hex');

  if (computedHash !== hash) {
    return res.status(400).json({ status: 'FAILED', message: 'Checksum validation failed.' });
  }

  syncedSubmissions.push({
    id,
    actionType,
    payload,
    timestamp,
    verifiedAt: new Date().toISOString(),
    hash
  });

  return res.status(200).json({ status: 'SUCCESS', committedId: id });
});

app.get('/api/ledger', (req, res) => {
  res.json({ totalSynced: syncedSubmissions.length, ledger: syncedSubmissions });
});

app.listen(PORT, () => {
  console.log(`[OpenEduGrid Edge Node] Gateway active on port ${PORT} under THE S.O. GROUP framework.`);
});
