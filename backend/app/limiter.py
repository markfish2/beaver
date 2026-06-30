from slowapi import Limiter
from slowapi.util import get_remote_address

def get_client_ip(request):
    """获取客户端真实 IP，支持反向代理"""
    # 优先从 X-Forwarded-For 获取（Nginx 反向代理）
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For 可能包含多个 IP，取第一个
        return forwarded.split(",")[0].strip()
    
    # 其次从 X-Real-IP 获取
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # 最后使用直接连接的 IP
    return get_remote_address(request)

limiter = Limiter(key_func=get_client_ip)
