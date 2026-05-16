import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  header: {
    marginBottom: 20,
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
  },
  description: {
    fontSize: 14,
    color: '#666666',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 16,
    backgroundColor: '#fafafa',
    padding: 14,
    gap: 12,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    color: '#111111',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  horizontalList: {
    marginBottom: 16,
  },
  conversationItem: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  conversationItemSelected: {
    borderColor: '#ff2d78',
    backgroundColor: '#fff0f5',
  },
  conversationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  conversationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  conversationMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff2d78',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  conversationSnippet: {
    fontSize: 13,
    color: '#4b5563',
  },
  chatArea: {
    flex: 1,
    gap: 14,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  presenceText: {
    fontSize: 12,
    color: '#2563eb',
  },
  messageList: {
    flex: 1,
  },
  emptyState: {
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 10,
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
  },
  messageContainerSent: {
    alignSelf: 'flex-end',
    backgroundColor: '#111111',
  },
  messageContainerReceived: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  messageText: {
    color: '#111111',
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextSent: {
    color: '#ffffff',
  },
  messageMeta: {
    marginTop: 6,
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'right',
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    gap: 10,
  },
  composerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  messageInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    color: '#111111',
  },
});
