import { envManager } from "../env";
import AWS from "aws-sdk";

export const s3 = new AWS.S3({
  accessKeyId: envManager.get("AWS_ACCESS_KEY_ID"),
  secretAccessKey: envManager.get("AWS_SECRET_ACCESS_KEY"),
  endpoint: envManager.get("S3_ENDPOINT"),
  s3ForcePathStyle: true, // for s3
});
