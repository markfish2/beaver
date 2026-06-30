import { useState, useCallback, useRef } from 'react';
import type { Command } from '../commands/types';

export const useHistory = () => {
  const [past, setPast] = useState<Command[]>([]);
  const [future, setFuture] = useState<Command[]>([]);
  
  // Use refs to always have access to latest state without closure issues
  const pastRef = useRef(past);
  const futureRef = useRef(future);
  const isProcessingRef = useRef(false);
  
  // Keep refs in sync with state
  pastRef.current = past;
  futureRef.current = future;

  const execute = useCallback((command: Command) => {
    // 🚀 核心修复：移除 isProcessingRef 检查，让所有命令都能立即执行
    // 命令应该是非阻塞的，立即更新本地状态，然后在后台异步同步到服务器
    
    // 立即更新 undo 栈，不等待命令执行完成
    setPast((prev) => [...prev, command]);
    setFuture([]); // Clear redo stack on new action
    
    // 在后台异步执行命令
    command.execute().catch((error) => {
      console.error('Command execution failed:', error);
    });
  }, []);

  const undo = useCallback(async () => {
    if (isProcessingRef.current) {
      console.warn('Cannot undo while processing another operation');
      return;
    }
    
    const currentPast = pastRef.current;
    if (currentPast.length === 0) return;
    
    isProcessingRef.current = true;
    
    const newPast = [...currentPast];
    const command = newPast.pop()!;
    
    try {
      // Execute undo logic first, then update state
      await command.undo();
      
      // Update state after successful undo
      setPast(newPast);
      setFuture((prev) => [command, ...prev]);
    } catch (error) {
      console.error('Undo failed:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  const redo = useCallback(async () => {
    if (isProcessingRef.current) {
      console.warn('Cannot redo while processing another operation');
      return;
    }
    
    const currentFuture = futureRef.current;
    if (currentFuture.length === 0) return;
    
    isProcessingRef.current = true;
    
    const newFuture = [...currentFuture];
    const command = newFuture.shift()!;
    
    try {
      // Execute redo logic first, then update state
      await command.execute();
      
      // Update state after successful redo
      setFuture(newFuture);
      setPast((prev) => [...prev, command]);
    } catch (error) {
      console.error('Redo failed:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  return {
    past,
    future,
    execute,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0
  };
};
