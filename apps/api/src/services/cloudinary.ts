import { v2 as cloudinary } from 'cloudinary'
import { env, cloudinaryConfigured } from '../config/env.js'
import { HttpError } from '../lib/errors.js'

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

const need = () => {
  if (!cloudinaryConfigured) throw new HttpError(503, 'File storage is not configured')
}

// Magic-byte sniffing: never trust the client-declared MIME type alone.
export function sniffImage(b: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp'
  return null
}

export function sniffDocument(b: Buffer): 'pdf' | 'zip' | null {
  if (b.length > 4 && b.subarray(0, 4).toString() === '%PDF') return 'pdf'
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) return 'zip' // docx/pptx/xlsx/zip
  return null
}

function stream(buffer: Buffer, options: Record<string, unknown>): Promise<{ secure_url: string; public_id: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(options, (err, result) => (err || !result ? reject(err ?? new Error('upload failed')) : resolve(result)))
      .end(buffer)
  })
}

export async function uploadImage(buffer: Buffer) {
  need()
  const r = await stream(buffer, { folder: 'spectrum/images', resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp'] })
  return r.secure_url
}

// Learning materials are stored with authenticated delivery: no public URL exists.
export async function uploadPrivateFile(buffer: Buffer, filename: string) {
  need()
  const r = await stream(buffer, { folder: 'spectrum/learning', resource_type: 'raw', type: 'authenticated', use_filename: true, unique_filename: true, filename_override: filename })
  return { publicId: r.public_id, bytes: r.bytes }
}

export function signedDownloadUrl(publicId: string): string {
  need()
  return cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'authenticated',
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + 120,
  })
}

export async function deletePrivateFile(publicId: string) {
  if (!cloudinaryConfigured) return
  await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' })
}
