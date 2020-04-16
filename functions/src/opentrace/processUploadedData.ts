import * as functions from "firebase-functions";
import {ObjectMetadata} from "firebase-functions/lib/providers/storage";
import { decryptTempID } from "./getTempIDs";
import getEncryptionKey from "./utils/getEncryptionKey";
import * as admin from "firebase-admin";

const {Storage} = require('@google-cloud/storage');
 
const storage = new Storage();

const processUploadedData = async (object: ObjectMetadata) => {

  if (object.contentType !== 'application/json'){
    console.log("not a json file");
    throw new functions.https.HttpsError('invalid-argument', 'Not a json file');
  }
  if (!object.bucket){
    console.log("bucket not provided");
    throw new functions.https.HttpsError('invalid-argument', 'No Bucket provided');
  }
  if (!object.name){
    console.log("file name not provided");
    throw new functions.https.HttpsError('invalid-argument', 'No file name');;
  }
  console.log("Attempting to download file: " + object.name);

  let record = await storage.bucket(object.bucket)
                            .file(object.name)
                            .download()
  
  console.log("File downloaded: " + record);
  const allMessages = record.records.map((event: { msg: string; }) => {
    return event.msg
  })
  let uniqueMessages = new Set<string>(allMessages);

  console.log("Unique messages: " + uniqueMessages);

  const encryptionKey = await getEncryptionKey();
  var pushTokensToNotify: string[] = []
  uniqueMessages.forEach(async (tempID: string) => {
    
    const decryptedTempID = decryptTempID(tempID, encryptionKey);
    const isValid = await validateTempID(decryptedTempID.uid, decryptedTempID.startTime, decryptedTempID.expiryTime);
    if (!isValid) {
      return
    }
    pushTokensToNotify.push(decryptedTempID.uid)
    
  })
  await sendPushNotifications(pushTokensToNotify);
};

async function sendPushNotifications(pushIDs: string[]) {
  console.log("Attempting push to" + pushIDs);
  // Notification details.
  const payload = {
    notification: {
      title: 'Contact trace detected',
      body: `You may be infected with COVID-19. You should self isolate.`
    }
  };
  // Send notifications to all tokens.
  return await admin.messaging().sendToDevice(pushIDs, payload);
}

async function validateTempID(pushID: string, startTime: number, endTime: number): Promise<boolean> {
  return true
}

export default processUploadedData;
