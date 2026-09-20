'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CheckCircle2, MessageCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  useChannelsControllerGetChannels,
  useChannelsControllerDeleteChannel,
} from '@/lib/api/generated/channels/channels';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import { AddChannelModal } from '@/components/channels/AddChannelModal';

export default function ChannelsSettingsPage() {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);

  const { data: channelsData, isLoading } = useChannelsControllerGetChannels();
  const deleteChannelMutation = useChannelsControllerDeleteChannel();

  const channels = (Array.isArray(channelsData) 
    ? channelsData 
    : (channelsData as unknown as { data?: unknown[]; items?: unknown[] })?.data || (channelsData as unknown as { data?: unknown[]; items?: unknown[] })?.items || []) as { id: string; provider: string; providerAccountId: string; createdAt: string }[];

  const handleDelete = () => {
    if (!channelToDelete) return;

    deleteChannelMutation.mutate(
      { id: channelToDelete },
      {
        onSuccess: () => {
          toast.success('Channel disconnected successfully');
          queryClient.invalidateQueries({ queryKey: [`/channels`] });
          setChannelToDelete(null);
        },
        onError: () => {
          toast.error('Failed to disconnect channel');
          setChannelToDelete(null);
        },
      }
    );
  };

  return (
    <div className="max-w-[1200px] mx-auto p-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-brand-ice tracking-tight flex items-center">
            CHANNELS & INTEGRATIONS
          </h1>
          <p className="text-brand-ice/60 font-medium mt-1">
            Connect your OmniDesk AI agent to external messaging platforms.
          </p>
        </div>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-brand-electric hover:bg-brand-electric/80 shadow-none shadow-brand-electric/20 h-11 rounded-xl font-bold transition-all active:scale-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          Connect WhatsApp
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-cyan" />
        </div>
      ) : channels.length === 0 ? (
        <Card className="border-dashed border-2 bg-brand-navy/50 shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 bg-blue-100 text-brand-cyan rounded-2xl flex items-center justify-center mb-6 shadow-inner">
              <MessageCircle className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-brand-ice mb-2">No Channels Connected</h3>
            <p className="text-brand-ice/60 max-w-md font-medium mb-8">
              Connect WhatsApp or other messaging platforms to allow your AI agent to communicate with leads instantly.
            </p>
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-brand-electric hover:bg-brand-electric/80 font-bold h-11 px-8 rounded-xl shadow-none shadow-brand-electric/20 transition-all active:scale-95"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add First Channel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {channels.map((channel: { id: string; provider: string; providerAccountId: string; createdAt: string }) => (
            <Card key={channel.id} className="relative overflow-hidden shadow-none hover:shadow-none transition-shadow group border-white/10">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-500" />
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-ice leading-none mb-1">
                        {channel.provider}
                      </h3>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] uppercase font-bold tracking-wider">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mt-6 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-[10px] font-bold text-brand-ice/60 uppercase tracking-widest mb-1">Account ID</p>
                    <p className="font-medium text-brand-ice/80 text-sm truncate">{channel.providerAccountId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-brand-ice/60 uppercase tracking-widest mb-1">Connected On</p>
                    <p className="font-medium text-brand-ice/80 text-sm">{new Date(channel.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => setChannelToDelete(channel.id)}
                    className="text-red-400 hover:text-red-400 hover:bg-red-500/10 h-9 font-bold"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <AddChannelModal 
        isOpen={isAddModalOpen} 
        onOpenChange={setIsAddModalOpen} 
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={!!channelToDelete} onOpenChange={(open) => !open && setChannelToDelete(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-400 font-bold text-xl">
              <AlertCircle className="mr-2 h-6 w-6" />
              Disconnect Channel
            </DialogTitle>
            <DialogDescription className="text-brand-ice/60 font-medium pt-2">
              Are you sure you want to disconnect this channel? Your AI agent will no longer be able to send or receive messages through this provider. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setChannelToDelete(null)}
              disabled={deleteChannelMutation.isPending}
              className="font-bold h-11 px-6 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteChannelMutation.isPending}
              className="font-bold h-11 px-6 rounded-xl"
            >
              {deleteChannelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
