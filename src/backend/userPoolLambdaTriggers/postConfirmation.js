import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import pg from 'pg';

const {Pool} = pg;
const {PG_SECRET_ARN} = process.env;

const secretClient = new SecretsManagerClient();
const secret = JSON.parse((await secretClient.send(
    new GetSecretValueCommand({SecretId: PG_SECRET_ARN})
)).SecretString);

const pool = new Pool({
  user: secret.username,
  password: secret.password,
});

const handler = async (event) => {
  console.log(event);
  const {triggerSource, request: {userAttributes}, userName} = event;
  const isExternalIDP =
    userAttributes['cognito:user_status'] === 'EXTERNAL_PROVIDER';
  if (triggerSource === 'PostConfirmation_ConfirmSignUp') {
    const displayName = isExternalIDP ?
      userAttributes.name :
      userAttributes.email.split('@')[0];
    console.log(`Display name: ${displayName}`);

    const poolClient = await pool.connect();
    console.log('DB connected successfully');
    try {
      const res = await poolClient.query(`
        INSERT INTO users(
          cognitoUserName,
          email,
          created,
          displayname,
          loginCount
        ) VALUES($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        userName,
        userAttributes.email,
        new Date(),
        displayName,
        isExternalIDP ? 1 : 0, // external IDP doesn't trigger postAuthentication
      ]);
      console.log(res);
    } catch (err) {
      console.log('Unable to insert user info', err);
    } finally {
      poolClient.release();
    }
  }
  return event;
};

export {handler};
