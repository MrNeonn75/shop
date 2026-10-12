import React, { useState, useMemo } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { useExportCsv } from '../../../shared/hooks/useExportCsv';
import { MOCK_ADMIN_USERS, AdminUser } from '../../../shared/adapters/mock/adminMockData';
import { buildUserAccessReview } from '../utils/effectivePermissionsEngine';
import { UserEffectivePermissions } from '../types/permissionsAdvanced';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  Search,
  Download,
  AlertTriangle,
  UserCheck,
  Building2,
} from 'lucide-react';

export const UserAccessReviewPage: React.FC = () => {
  const { toast } = useToast();
  const { exportToCsv } = useExportCsv<UserEffectivePermissions>();

  const [users] = useState<AdminUser[]>(MOCK_ADMIN_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserEffectivePermissions | null>(null);

  // Compute effective permissions & review data for each user
  const reviews: UserEffectivePermissions[] = useMemo(() => {
    return users.map((u) => {
      // Simulate demo direct grants/revocations for specific users
      const directGrants = u.id === 'usr-003' ? ['inventory.stock.adjust'] : [];
      const directRevocations = u.id === 'usr-004' ? ['pos.discount.apply'] : [];
      return buildUserAccessReview(u, directGrants, directRevocations);
    });
  }, [users]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (inactiveOnly && !r.isInactive) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.userName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.roleName.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [reviews, searchQuery, inactiveOnly]);

  const handleExport = () => {
    exportToCsv(filteredReviews, {
      filename: `brand_house_user_access_review_${new Date().toISOString().slice(0, 10)}.csv`,
      columns: [
        { header: 'İstifadəçi ID', accessor: 'userId' },
        { header: 'Ad və Soyad', accessor: 'userName' },
        { header: 'Email', accessor: 'email' },
        { header: 'Rol', accessor: 'roleName' },
        { header: 'Status', accessor: (row) => (row.isInactive ? 'Qeyri-aktiv (>30 gün)' : 'Aktiv') },
        { header: 'Son Giriş', accessor: (row) => formatDateTime(row.lastLoginAt) },
        { header: 'Filial Əhatəsi', accessor: (row) => (row.canAccessAllBranches ? 'Bütün Filiallar' : row.allowedBranchIds.join('; ')) },
        { header: 'Effektiv İcazələr Sayı', accessor: (row) => row.effectivePermissions.length },
        { header: 'Effektiv İcazələr', accessor: (row) => row.effectivePermissions.join(', ') },
      ],
    });

    toast({
      type: 'success',
      title: 'Giriş Nəzarəti Hesabatı İxrac Edildi',
      message: 'İstifadəçi effektiv icazələri və audit qeydləri CSV formatında endirildi.',
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'İdarəetmə Paneli', href: '/' },
          { label: 'Sistem və Administrasiya' },
          { label: 'İstifadəçilər', href: '/admin/users' },
          { label: 'Giriş Nəzarəti Təftişi (Access Review)' },
        ]}
      />

      <PageHeader
        title="Dövri İstifadəçi Giriş Təftişi (User Access Review)"
        description="Bütün istifadəçilərin effektiv səlahiyyətlərinin (rollar + fərdi icazə əlavələri), filial əhatəsinin və qeyri-aktivlik statusunun rəsmi auditi və təsdiqi."
        badge={
          <Badge variant="neutral" size="sm">
            {reviews.length} İstifadəçi Hesabı
          </Badge>
        }
        actions={
          <Button variant="default" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Audit Hesabatını İxrac Et (CSV)
          </Button>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Ümumi İstifadəçi</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{reviews.length}</h3>
            </div>
            <UserCheck className="h-8 w-8 text-muted-foreground/30" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Qeyri-aktiv Hesablar</p>
              <h3 className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {reviews.filter((r) => r.isInactive).length}
              </h3>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-500/30" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Bütün Filiallara Giriş Hüququ</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">
                {reviews.filter((r) => r.canAccessAllBranches).length}
              </h3>
            </div>
            <Building2 className="h-8 w-8 text-bh-accent/30" />
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ad, email və ya rol ilə axtar..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setInactiveOnly(!inactiveOnly)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                inactiveOnly
                  ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Yalnız Qeyri-Aktivlər (&gt;30 gün)</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Users Matrix Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                <th className="p-3">İstifadəçi</th>
                <th className="p-3">Rolu</th>
                <th className="p-3">Filial Əhatəsi</th>
                <th className="p-3">Son Giriş</th>
                <th className="p-3">Status</th>
                <th className="p-3">Effektiv İcazələr</th>
                <th className="p-3 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredReviews.map((review) => (
                <tr key={review.userId} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <p className="font-semibold text-foreground">{review.userName}</p>
                    <p className="text-[11px] text-muted-foreground">{review.email}</p>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" size="sm">
                      {review.roleName}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {review.canAccessAllBranches ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        🌐 Bütün Filiallar
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {review.allowedBranchIds.join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-muted-foreground">
                    {formatDateTime(review.lastLoginAt)}
                  </td>
                  <td className="p-3">
                    {review.isInactive ? (
                      <Badge variant="warning" size="sm" className="flex items-center gap-1 w-fit">
                        <AlertTriangle className="h-3 w-3" />
                        Qeyri-aktiv ({review.inactiveDays} gün)
                      </Badge>
                    ) : (
                      <Badge variant="default" size="sm" className="bg-emerald-600 w-fit">
                        Aktiv
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground">
                        {review.effectivePermissions.includes('*')
                          ? 'Bütün (*)'
                          : `${review.effectivePermissions.length} icazə`}
                      </span>
                      {review.directGrants.length > 0 && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-500/10 px-1 rounded">
                          +{review.directGrants.length} əlavə
                        </span>
                      )}
                      {review.directRevocations.length > 0 && (
                        <span className="text-[10px] text-rose-600 bg-rose-500/10 px-1 rounded">
                          -{review.directRevocations.length} xaric
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedUser(review)}
                      className="text-xs"
                    >
                      İcazə Siyahısına Bax
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User Effective Permissions Drawer / Modal */}
      {selectedUser && (
        <Card className="border-bh-accent/40 bg-muted/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-foreground text-sm">
                  {selectedUser.userName} — Effektiv İcazələr Matrisi
                </h4>
                <p className="text-xs text-muted-foreground">
                  Rol: {selectedUser.roleName} ({selectedUser.role})
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>
                Bağla
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-background rounded-md border border-border">
              {selectedUser.effectivePermissions.map((perm) => (
                <code
                  key={perm}
                  className="text-[11px] font-mono bg-muted/80 px-2 py-0.5 rounded border border-border text-foreground"
                >
                  {perm}
                </code>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
