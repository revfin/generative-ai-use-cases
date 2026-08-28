import React, { ReactNode, useMemo } from 'react';
import { BaseProps } from '../@types/common';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { PiGear } from 'react-icons/pi';
import { fetchAuthSession } from 'aws-amplify/auth';
import useUserSetting from '../hooks/useUserSetting';
import { useTranslation } from 'react-i18next';

type Props = BaseProps & {
  builderMode?: boolean;
  children: ReactNode;
};

const DrawerBase: React.FC<Props> = (props) => {
  const { settingShowEmail } = useUserSetting();
  const { t } = useTranslation();

  // The first argument is not required, but if it is not included, the request will not be made, so 'user' string is entered
  const { data } = useSWR('user', () => {
    return fetchAuthSession();
  });

  const email = useMemo<string>(() => {
    return (data?.tokens?.idToken?.payload.email ?? '') as string;
  }, [data]);

  const settingUrl = useMemo(() => {
    return props.builderMode ? `/use-case-builder/setting` : '/setting';
  }, [props.builderMode]);

  return (
    <nav className="text-aws-font-color flex h-screen w-72 flex-col justify-between border-r border-[#EFEFEF] bg-white text-sm print:hidden">
      <div className="flex h-full flex-col overflow-hidden">
        {props.children}
        <div className="flex flex-none flex-col gap-1 border-t border-[#EFEFEF] px-3 py-3">
          {settingShowEmail && email && (
            <div className="truncate px-2 text-[11px] text-[#969696]">
              {email}
            </div>
          )}
          <Link
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-[#F7F7F7]"
            to={settingUrl}>
            <PiGear className="text-base text-[#969696]" />
            {t('navigation.settings')}
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default DrawerBase;
