import * as functions from "firebase-functions";
import {ObjectMetadata} from "firebase-functions/lib/providers/storage";
import { decryptTempID } from "./getTempIDs";
import getEncryptionKey from "./utils/getEncryptionKey";
import * as admin from "firebase-admin";

const {Storage} = require('@google-cloud/storage');
const storage = new Storage();

const { Datastore } = require('@google-cloud/datastore');
const datastore = new Datastore();

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

  let fileContents = await storage.bucket(object.bucket)
                            .file(object.name)
                            .download()
  
  console.log("File downloaded: " + fileContents);
  const fileJSON = JSON.parse(fileContents);
  const allMessages = fileJSON.records.filter((event: { msg: string; }) => {
    return event.msg != null && event.msg !== 'not_found'
  }).map((event: { msg: string; }) => {
    return event.msg
  })
  let uniqueMessages = new Set<string>(allMessages);

  const encryptionKey = await getEncryptionKey();
  const pushTokensToNotify = await Promise.all(
    Array.from(uniqueMessages).map(
      async (tempID: string) => extractPushToken(encryptionKey, tempID)
    )
  );
  const pushResult = await sendPushNotifications(pushTokensToNotify);
  console.log(pushResult)
};

async function extractPushToken(encryptionKey: Buffer, tempID: string) {
  if (tempID === 'not_found') {
    return "MISSING_TOKEN"
  }
  console.log("Attempting to decrypt: " + tempID)
  const decryptedTempID = decryptTempID(tempID, encryptionKey);
  
  const query = datastore
    .createQuery('UniqueIDs')
    .filter('uniqueID', '=', decryptedTempID.uid)
    .limit(1);

  
   const results = await datastore.runQuery(query);
   const pushToken = results[0][0].pushToken;
   console.log('Appending: ' + pushToken);
   return pushToken
}

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

// async function validateTempID(pushID: string, startTime: number, endTime: number): Promise<boolean> {
//   return true
// }

export default processUploadedData;
