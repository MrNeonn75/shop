import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Button } from '../ui/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full text-center space-y-5 p-8 border border-border rounded-xl bg-card shadow-sm">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestion className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <span className="text-4xl font-extrabold tracking-widest text-bh-accent">404</span>
          <h2 className="text-xl font-bold tracking-tight">Səhifə Tapılmadı</h2>
          <p className="text-sm text-muted-foreground">
            Axtardığınız səhifə mövcud deyil, silinib və ya ünvan səhv daxil edilib.
          </p>
        </div>

        <div className="pt-2">
          <Link to="/">
            <Button variant="default" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Əsas səhifəyə qayıt
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

