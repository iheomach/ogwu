import { apiGet, apiPost } from './api';

export type DocumentStatus = 'pending' | 'extracting' | 'embedding' | 'complete' | 'failed';

export type DocumentRecord = {
  id: string;
  status: DocumentStatus;
  file_name: string;
  created_at: string;
  updated_at: string;
  error: string | null;
};

export type UploadInitResponse = {
  documentId: string;
  uploadUrl: string;
  s3Key: string;
};

export async function documentsInitUpload(
  fileName: string,
  mimeType: string,
): Promise<UploadInitResponse> {
  return apiPost('/api/documents/upload', { fileName, mimeType });
}

export async function documentsGetStatus(documentId: string): Promise<DocumentRecord> {
  return apiGet(`/api/documents/${encodeURIComponent(documentId)}/status`);
}

export async function uploadFileToS3(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mimeType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send({ uri: fileUri, type: mimeType, name: fileUri.split('/').pop() } as any);
  });
}
