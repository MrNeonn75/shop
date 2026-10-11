import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button';

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full text-center space-y-5 p-8 border border-border rounded-xl bg-card shadow-sm">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-danger/10 text-danger">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <span className="text-4xl font-extrabold tracking-widest text-danger">403</span>
          <h2 className="text-xl font-bold tracking-tight">Giriş Qadağandır</h2>
          <p className="text-sm text-muted-foreground">
            Bu bölməyə və ya əməliyyata daxil olmaq üçün tələb olunan istifadəçi hüququnuz (icazəniz) yoxdur.
          </p>
        </div>

        <div className="pt-2">
          <Link to="/">
            <Button variant="default" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Ana səhifəyə qayıt
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

