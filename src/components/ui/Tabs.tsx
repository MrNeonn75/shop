import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../shared/utils/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  content?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  items?: TabItem[];
  className?: string;
  children?: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({
  defaultValue,
  value,
  onValueChange,
  items,
  className,
  children,
}) => {
  return (
    <RadixTabs.Root
      defaultValue={defaultValue || items?.[0]?.id}
      value={value}
      onValueChange={onValueChange}
      className={cn('flex flex-col gap-4', className)}
    >
      {items && (
        <RadixTabs.List className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-fit select-none">
          {items.map((tab) => (
            <RadixTabs.Trigger
              key={tab.id}
              value={tab.id}
              disabled={tab.disabled}
              className={cn(
                'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs'
              )}
            >
              {tab.icon && <span className="h-4 w-4 shrink-0">{tab.icon}</span>}
              {tab.label}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
      )}

      {items
        ? items.map((tab) => (
            <RadixTabs.Content
              key={tab.id}
              value={tab.id}
              className="ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {tab.content}
            </RadixTabs.Content>
          ))
        : children}
    </RadixTabs.Root>
  );
};

export const TabsList = RadixTabs.List;
export const TabsTrigger = RadixTabs.Trigger;
export const TabsContent = RadixTabs.Content;

