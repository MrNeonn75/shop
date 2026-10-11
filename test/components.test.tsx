import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';
import { MoneyInput } from '../src/components/ui/MoneyInput';
import { Badge } from '../src/components/ui/Badge';
import { PermissionGate } from '../src/components/ui/PermissionGate';
import { useSessionStore } from '../src/shared/stores/sessionStore';
import { toQapik } from '../src/shared/utils/money';

describe('UI Component Library', () => {
  describe('Button', () => {
    it('renders with children and responds to click events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Yadda saxla</Button>);

      const btn = screen.getByRole('button', { name: /yadda saxla/i });
      expect(btn).toBeInTheDocument();

      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading state, sets aria-busy, and disables button', () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Göndər
        </Button>
      );

      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');

      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('applies destructive variant styles', () => {
      render(<Button variant="destructive">Sil</Button>);
      const btn = screen.getByRole('button', { name: /sil/i });
      expect(btn.className).toContain('bg-danger');
    });
  });

  describe('Input', () => {
    it('renders correctly and sets aria-invalid when hasError is true', () => {
      render(<Input placeholder="Axtar..." hasError />);
      const input = screen.getByPlaceholderText('Axtar...');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.className).toContain('border-danger');
    });

    it('handles value changes', () => {
      const handleChange = vi.fn();
      render(<Input placeholder="Artikul" onChange={handleChange} />);
      const input = screen.getByPlaceholderText('Artikul');

      fireEvent.change(input, { target: { value: 'TH-101' } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('MoneyInput', () => {
    it('renders initial Qəpik amount in AZN format with ₼ symbol', () => {
      render(<MoneyInput value={toQapik(14990)} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('149.90');
      expect(screen.getByText('₼')).toBeInTheDocument();
    });

    it('calls onMoneyChange with integer Qəpik and AZN numbers on input', () => {
      const handleChange = vi.fn();
      render(<MoneyInput onMoneyChange={handleChange} />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: '34.90' } });

      expect(handleChange).toHaveBeenCalledWith({
        qapik: 3490,
        azn: 34.9,
        formatted: '34.90 ₼',
      });
    });
  });

  describe('Badge', () => {
    it('renders label and dot indicator when hasDot is true', () => {
      render(
        <Badge variant="success" hasDot>
          Stokda var
        </Badge>
      );
      expect(screen.getByText('Stokda var')).toBeInTheDocument();
    });
  });

  describe('PermissionGate', () => {
    it('renders children when user role matches', () => {
      useSessionStore.getState().switchRoleForDemo('superadmin');

      render(
        <PermissionGate role="superadmin" fallback={<div>İcazə yoxdur</div>}>
          <div data-testid="protected-content">Məxfi Məlumat</div>
        </PermissionGate>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByText('İcazə yoxdur')).not.toBeInTheDocument();
    });

    it('renders fallback when user role lacks required permission', () => {
      useSessionStore.getState().switchRoleForDemo('cashier');

      render(
        <PermissionGate permission="settings:manage" fallback={<div>İcazə yoxdur</div>}>
          <div data-testid="protected-content">Tənzimləmələr</div>
        </PermissionGate>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('İcazə yoxdur')).toBeInTheDocument();
    });
  });
});

