# 快速更新SSH配置脚本
# 将旧的Mac IP地址更新为新IP

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SSH配置快速更新工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oldIP = "<YOUR_MAC_IP>"
$configPath = "$env:USERPROFILE\.ssh\config"

Write-Host "当前配置的Mac IP: $oldIP" -ForegroundColor Yellow
Write-Host ""
Write-Host "请在Mac上查看新IP地址:" -ForegroundColor Cyan
Write-Host "  方法1: 系统设置 > 网络 > WiFi > 详细信息" -ForegroundColor White
Write-Host "  方法2: 在Mac终端运行: ifconfig | grep 'inet '" -ForegroundColor White
Write-Host "  方法3: 系统设置 > 网络 > 高级 > TCP/IP" -ForegroundColor White
Write-Host ""

$newIP = Read-Host "请输入Mac的新IP地址"

if ($newIP -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
    Write-Host ""
    Write-Host "正在更新SSH配置..." -ForegroundColor Yellow
    
    try {
        $configContent = Get-Content $configPath -Raw
        $newConfig = $configContent -replace $oldIP, $newIP
        
        # 备份原配置
        $backupPath = "$configPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item $configPath $backupPath
        Write-Host "  已备份原配置到: $backupPath" -ForegroundColor Gray
        
        # 更新配置
        Set-Content -Path $configPath -Value $newConfig -NoNewline
        Write-Host ""
        Write-Host "✓ SSH配置已更新!" -ForegroundColor Green
        Write-Host ""
        Write-Host "旧IP: $oldIP -> 新IP: $newIP" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "现在可以尝试连接:" -ForegroundColor Yellow
        Write-Host "  ssh $newIP" -ForegroundColor White
        Write-Host "  或" -ForegroundColor Gray
        Write-Host "  ssh mac@$newIP" -ForegroundColor White
        Write-Host ""
        
        # 测试连接
        $test = Read-Host "是否现在测试SSH连接? (Y/N)"
        if ($test -eq 'Y' -or $test -eq 'y') {
            Write-Host ""
            Write-Host "正在测试连接..." -ForegroundColor Yellow
            ssh -o ConnectTimeout=5 $newIP "echo '连接成功!'; hostname"
        }
    } catch {
        Write-Host ""
        Write-Host "✗ 更新失败: $_" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "✗ 无效的IP地址格式!" -ForegroundColor Red
    Write-Host "  请输入正确的IP地址，例如: 192.168.1.100" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan


