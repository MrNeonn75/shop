import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { branchRepository } from '../../../shared/adapters';
import { Building2, MapPin, Phone, User } from 'lucide-react';
import { Skeleton } from '../../../components/ui/Skeleton';

export const BranchesPage: React.FC = () => {
  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchRepository.getBranches(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Filiallar Şəbəkəsi"
        description="BRAND HOUSE pərakəndə satış nöqtələri və anbar məkanları."
        breadcrumbs={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Filiallar' },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={`skel-branch-${i}`} className="p-5 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-4 w-32" />
            </Card>
          ))
        ) : (
          branches?.map((branch) => (
            <Card key={branch.id} className="transition-all hover:shadow-xs">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-bh-accent" />
                    <h3 className="font-semibold text-base text-foreground">{branch.name}</h3>
                  </div>
                  <Badge variant={branch.isActive ? 'success' : 'neutral'} hasDot size="sm">
                    {branch.code}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground pt-1">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    <span>{branch.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{branch.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>Menecer: <strong className="text-foreground">{branch.manager}</strong></span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

