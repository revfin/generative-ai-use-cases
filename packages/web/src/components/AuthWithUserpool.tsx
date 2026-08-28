import { Amplify } from 'aws-amplify';
import { Authenticator, translations } from '@aws-amplify/ui-react';
import { I18n } from 'aws-amplify/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useBranding from '../hooks/useBranding';

const speechToSpeechEventApiEndpoint: string = import.meta.env
  .VITE_APP_SPEECH_TO_SPEECH_EVENT_API_ENDPOINT;

type Props = {
  children: React.ReactNode;
};

const AuthWithUserpool: React.FC<Props> = (props) => {
  const { t, i18n } = useTranslation();
  const { title: brandingTitle, logoPath } = useBranding();
  const productName = brandingTitle || t('auth.title');

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_APP_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_APP_USER_POOL_CLIENT_ID,
        identityPoolId: import.meta.env.VITE_APP_IDENTITY_POOL_ID,
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

  I18n.putVocabularies(translations);
  // Amplify's default copy is verbose for a single sign-in screen
  I18n.putVocabularies({
    en: {
      'Forgot your password?': 'Forgot password?',
    },
  });
  I18n.setLanguage(i18n.language === 'ja' ? 'ja' : 'en');

  return (
    <Authenticator
      // Accounts are provisioned by an administrator: no self sign-up UI
      hideSignUp
      components={{
        Header: () => (
          <div className="flex flex-col items-center gap-5 pb-8 pt-16">
            {logoPath ? (
              <img src={logoPath} alt="" className="size-12 rounded-xl" />
            ) : (
              <div className="bg-aws-smile size-12 rounded-xl" />
            )}
            <h1 className="text-aws-font-color text-[21px] font-semibold">
              {t('auth.sign_in_to', { name: productName })}
            </h1>
          </div>
        ),
      }}
      formFields={{
        signIn: {
          username: {
            labelHidden: true,
            placeholder: t('auth.email'),
            autocomplete: 'username',
          },
          password: {
            labelHidden: true,
            placeholder: t('auth.password'),
            autocomplete: 'current-password',
          },
        },
        forgotPassword: {
          username: {
            labelHidden: true,
            placeholder: t('auth.email'),
          },
        },
        confirmResetPassword: {
          confirmation_code: {
            labelHidden: true,
          },
          password: {
            labelHidden: true,
          },
          confirm_password: {
            labelHidden: true,
          },
        },
      }}>
      {props.children}
    </Authenticator>
  );
};

export default AuthWithUserpool;
