const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const supabase = require('../lib/supabase');
const serverError = require('../lib/serverError');

const router = express.Router();

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_BUCKET;

// POST /api/documents/upload
// Body: { fileName: string, mimeType: string }
// Returns: { documentId, uploadUrl, s3Key }
router.post('/upload', async (req, res) => {
  const { fileName, mimeType } = req.body;

  if (!fileName || !mimeType) {
    return res.status(400).json({ error: 'fileName and mimeType are required.' });
  }

  const patientId = req.user.id;

  // Create the document row first to get a stable id
  const { data: doc, error: insertErr } = await supabase
    .from('documents')
    .insert({
      patient_id: patientId,
      s3_key: '',
      file_name: fileName,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr) return serverError(res, insertErr, 'Failed to create document record.');

  const s3Key = `patients/${patientId}/${doc.id}/${fileName}`;

  const { error: updateErr } = await supabase
    .from('documents')
    .update({ s3_key: s3Key })
    .eq('id', doc.id);

  if (updateErr) return serverError(res, updateErr, 'Failed to update document record.');

  try {
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: mimeType }),
      { expiresIn: 300 },
    );

    return res.json({ documentId: doc.id, uploadUrl, s3Key });
  } catch (e) {
    return serverError(res, e, 'Failed to generate upload URL.');
  }
});

// GET /api/documents/:id/status
// Returns: { id, status, file_name, created_at, updated_at, error }
router.get('/:id/status', async (req, res) => {
  const { data, error } = await supabase
    .from('documents')
    .select('id, status, file_name, created_at, updated_at, error')
    .eq('id', req.params.id)
    .eq('patient_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Document not found.' });
  return res.json(data);
});

module.exports = router;
