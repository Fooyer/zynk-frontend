/**
 * P2P File Transfer via WebRTC Data Channels.
 *
 * Envia arquivos em chunks de 16KB entre peers.
 * Usa um RTCDataChannel dedicado para cada transferência.
 */

const CHUNK_SIZE = 16 * 1024; // 16KB per chunk

export interface FileTransferProgress {
  filename: string;
  totalSize: number;
  transferred: number;
  percentage: number;
}

export interface ReceivedFile {
  filename: string;
  type: string;
  data: Blob;
}

type ProgressCallback = (progress: FileTransferProgress) => void;
type FileReceivedCallback = (file: ReceivedFile) => void;

/**
 * Envia um arquivo via WebRTC data channel.
 * O channel deve estar aberto (readyState === 'open').
 */
export async function sendFile(
  channel: RTCDataChannel,
  file: File,
  onProgress?: ProgressCallback,
): Promise<void> {
  // Envia metadados primeiro
  const meta = JSON.stringify({
    type: 'file-meta',
    filename: file.name,
    fileType: file.type,
    size: file.size,
  });
  channel.send(meta);

  const buffer = await file.arrayBuffer();
  let offset = 0;

  while (offset < buffer.byteLength) {
    // Controle de fluxo: espera bufferedAmount baixar
    while (channel.bufferedAmount > 64 * 1024) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const end = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
    const chunk = buffer.slice(offset, end);
    channel.send(chunk);
    offset = end;

    onProgress?.({
      filename: file.name,
      totalSize: file.size,
      transferred: offset,
      percentage: Math.round((offset / file.size) * 100),
    });
  }

  // Sinaliza fim
  channel.send(JSON.stringify({ type: 'file-end' }));
}

/**
 * Cria um receiver para arquivos em um data channel.
 * Retorna uma função cleanup.
 */
export function receiveFile(
  channel: RTCDataChannel,
  onFileReceived: FileReceivedCallback,
  onProgress?: ProgressCallback,
): () => void {
  let currentMeta: { filename: string; fileType: string; size: number } | null = null;
  let chunks: ArrayBuffer[] = [];
  let received = 0;

  const handleMessage = (event: MessageEvent) => {
    if (typeof event.data === 'string') {
      const msg = JSON.parse(event.data);

      if (msg.type === 'file-meta') {
        currentMeta = { filename: msg.filename, fileType: msg.fileType, size: msg.size };
        chunks = [];
        received = 0;
      } else if (msg.type === 'file-end' && currentMeta) {
        const blob = new Blob(chunks, { type: currentMeta.fileType });
        onFileReceived({
          filename: currentMeta.filename,
          type: currentMeta.fileType,
          data: blob,
        });
        currentMeta = null;
        chunks = [];
        received = 0;
      }
    } else if (event.data instanceof ArrayBuffer && currentMeta) {
      chunks.push(event.data);
      received += event.data.byteLength;

      onProgress?.({
        filename: currentMeta.filename,
        totalSize: currentMeta.size,
        transferred: received,
        percentage: Math.round((received / currentMeta.size) * 100),
      });
    }
  };

  channel.binaryType = 'arraybuffer';
  channel.addEventListener('message', handleMessage);

  return () => {
    channel.removeEventListener('message', handleMessage);
  };
}

/**
 * Cria um data channel dedicado para file transfer em uma peer connection.
 */
export function createFileTransferChannel(pc: RTCPeerConnection): RTCDataChannel {
  return pc.createDataChannel('file-transfer', {
    ordered: true,
  });
}
