import { Suspense } from 'react';
import { EmailVerificationPage } from '@/components/auth/EmailVerificationPage';
import { LoadingPage } from '@/components/common/LoadingSpinner';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <EmailVerificationPage />
    </Suspense>
  );
}
