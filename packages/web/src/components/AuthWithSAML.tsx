import React, { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import '@aws-amplify/ui-react/styles.css';
import { signInWithRedirect } from 'aws-amplify/auth';
import { useTranslation } from 'react-i18next';
import useBranding from '../hooks/useBranding';

const samlCognitoDomainName: string = import.meta.env
  .VITE_APP_SAML_COGNITO_DOMAIN_NAME;
const samlCognitoFederatedIdentityProviderName: string = import.meta.env
  .VITE_APP_SAML_COGNITO_FEDERATED_IDENTITY_PROVIDER_NAME;
const speechToSpeechEventApiEndpoint: string = import.meta.env
  .VITE_APP_SPEECH_TO_SPEECH_EVENT_API_ENDPOINT;

type Props = {
  children: React.ReactNode;
};

const AuthWithSAML: React.FC<Props> = (props) => {
  const { t } = useTranslation();
  const { title: brandingTitle, logoPath } = useBranding();
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);

  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify the authentication status
    if (authStatus === 'configuring') {
      setLoading(true);
      setAuthenticated(false);
    } else if (authStatus === 'authenticated') {
      setLoading(false);
      setAuthenticated(true);
    } else {
      setLoading(false);
      setAuthenticated(false);
    }
  }, [authStatus]);

  const signIn = () => {
    signInWithRedirect({
      provider: {
        custom: samlCognitoFederatedIdentityProviderName,
      },
    });
  };

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_APP_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_APP_USER_POOL_CLIENT_ID,
        identityPoolId: import.meta.env.VITE_APP_IDENTITY_POOL_ID,
        loginWith: {
          oauth: {
            domain: samlCognitoDomainName, // Specify the value in cdk.json
            scopes: ['openid', 'email', 'profile'],
            // Get the Web page deployed with CloudFront dynamically
            redirectSignIn: [window.location.origin],
            redirectSignOut: [window.location.origin],
            responseType: 'code',
          },
        },
      },
    },
    API: {
      Events: {
        endpoint: speechToSpeechEventApiEndpoint,
        region: process.env.VITE_APP_REGION!,
        defaultAuthMode: 'userPool',
      },
    },
  });

  return (
    <>
      {loading ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          {logoPath ? (
            <img
              src={logoPath}
              alt=""
              className="size-12 animate-pulse rounded-xl"
            />
          ) : null}
          <span className="text-[13px] text-[#969696]">
            {t('auth.loading')}
          </span>
        </div>
      ) : !authenticated ? (
        <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center px-6 pt-32">
          {logoPath ? (
            <img src={logoPath} alt="" className="size-12 rounded-xl" />
          ) : (
            <div className="bg-aws-smile size-12 rounded-xl" />
          )}
          <h1 className="text-aws-font-color mt-5 text-[21px] font-semibold">
            {t('auth.sign_in_to', {
              name: brandingTitle || t('auth.title'),
            })}
          </h1>
          <button
            className="bg-aws-squid-ink hover:bg-aws-anchor focus-visible:ring-aws-squid-ink mt-8 h-12 w-full rounded-lg text-[15px] font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            onClick={() => signIn()}>
            {t('auth.login')}
          </button>
        </div>
      ) : (
        <>{props.children}</>
      )}
    </>
  );
};

export default AuthWithSAML;
