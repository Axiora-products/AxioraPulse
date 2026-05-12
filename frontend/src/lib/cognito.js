import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

let _userPool = null;

function getUserPool() {
  if (!_userPool) {
    const id = import.meta.env.VITE_COGNITO_USER_POOL_ID;
    const clientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID;
    if (!id || !clientId) throw new Error('VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_APP_CLIENT_ID must be set');
    _userPool = new CognitoUserPool({ UserPoolId: id, ClientId: clientId });
  }
  return _userPool;
}

export function cognitoSignIn(email, password) {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH');
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function cognitoSignUp(email, password, name) {
  return new Promise((resolve, reject) => {
    const attrs = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];
    getUserPool().signUp(email, password, attrs, null, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function cognitoConfirmSignUp(email, code) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function cognitoForgotPassword(email) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.forgotPassword({
      onSuccess: resolve,
      onFailure: reject,
      inputVerificationCode: resolve,
    });
  });
}

export function cognitoConfirmPassword(email, code, newPassword) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool() });
    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function cognitoGetCurrentSession() {
  return new Promise((resolve, reject) => {
    const user = getUserPool().getCurrentUser();
    if (!user) return reject(new Error('No authenticated user'));
    user.getSession((err, session) => {
      if (err) reject(err);
      else resolve(session);
    });
  });
}

export function cognitoSignOut() {
  try {
    const user = getUserPool().getCurrentUser();
    if (user) user.signOut();
  } catch {
    // pool not configured yet — nothing to sign out
  }
}
