'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createChannelSchema, type CreateChannelInput } from '@/lib/validations/channel';
import { useChannelsControllerCreateChannel } from '@/lib/api/generated/channels/channels';

interface AddChannelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddChannelModal({ isOpen, onOpenChange }: AddChannelModalProps) {
  const queryClient = useQueryClient();
  const createChannelMutation = useChannelsControllerCreateChannel();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateChannelInput>({
    resolver: zodResolver(createChannelSchema) as any,
    defaultValues: {
      provider: 'WHATSAPP_CLOUD_API',
      providerAccountId: '',
      accessToken: '',
    },
  });

  const onSubmit = (data: CreateChannelInput) => {
    createChannelMutation.mutate(
      { data },
      {
        onSuccess: () => {
          toast.success('WhatsApp Channel connected successfully!');
          queryClient.invalidateQueries({ queryKey: [`/channels`] });
          reset();
          onOpenChange(false);
        },
        onError: (error: any) => {
          // Catch 400 bad request or other errors
          console.error(error);
          toast.error(
            error?.response?.data?.message || 
            'Invalid token or Meta API rejected the connection.'
          );
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">Connect WhatsApp</DialogTitle>
          <DialogDescription className="text-slate-500 font-medium">
            Link your Meta developer app to start receiving and sending messages.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-blue-50 border-blue-200 text-blue-900 mt-2">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="font-bold text-blue-900">Meta API Setup</AlertTitle>
          <AlertDescription className="text-blue-800 text-xs mt-1">
            Enter the <strong>Phone Number ID</strong> and <strong>System User Access Token</strong> generated from your Meta Developer Portal. Ensure the token has the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="providerAccountId" className="font-bold text-slate-700">Phone Number ID</Label>
              <Input
                id="providerAccountId"
                placeholder="e.g. 102345678901234"
                {...register('providerAccountId')}
                className={`h-11 ${errors.providerAccountId ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              />
              {errors.providerAccountId && (
                <p className="text-red-500 text-xs font-semibold">{errors.providerAccountId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessToken" className="font-bold text-slate-700">Permanent Access Token</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="EAAI..."
                {...register('accessToken')}
                className={`h-11 ${errors.accessToken ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              />
              {errors.accessToken && (
                <p className="text-red-500 text-xs font-semibold">{errors.accessToken.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="font-bold h-11 px-6 rounded-xl"
              disabled={createChannelMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 font-bold h-11 px-6 rounded-xl shadow-xl shadow-blue-200 transition-all active:scale-95"
              disabled={createChannelMutation.isPending}
            >
              {createChannelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect WhatsApp'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
