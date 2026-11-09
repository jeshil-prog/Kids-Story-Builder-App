import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const region = () => process.env.AWS_REGION || 'ap-southeast-2'

function client() {
  return new S3Client({
    region: region(),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  })
}

// The public web address of a stored file.
export const s3Url = (key) => `https://${process.env.AWS_S3_BUCKET}.s3.${region()}.amazonaws.com/${key}`

// Turns one of our own file addresses back into its key, or null if the address
// is not one of ours. Used so a route can never be pointed at some other website.
export function keyFromOurUrl(url) {
  const prefix = `${s3Url('')}`
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null
  const key = decodeURIComponent(url.slice(prefix.length).split('?')[0])
  if (!key || key.includes('..')) return null
  return key
}

export async function uploadToS3(b64, contentType, key) {
  const buf = Buffer.from(b64, 'base64')
  await client().send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000'
  }))
  return s3Url(key)
}

export async function deleteFromS3(key) {
  await client().send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }))
}
