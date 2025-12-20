# SSH连接检查和配置更新脚本
# 用于检查Mac的SSH连接并更新IP地址

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SSH连接诊断和配置工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查旧IP
$oldIP = "192.168.102.181"
Write-Host "1. 检查旧IP地址: $oldIP" -ForegroundColor Yellow
$pingResult = Test-Connection -ComputerName $oldIP -Count 2 -Quiet -ErrorAction SilentlyContinue
if ($pingResult) {
    Write-Host "   ✓ 旧IP地址可达" -ForegroundColor Green
} else {
    Write-Host "   ✗ 旧IP地址不可达（可能已改变）" -ForegroundColor Red
}
Write-Host ""

# 显示当前网络信息
Write-Host "2. 当前Windows网络信息:" -ForegroundColor Yellow
$networkAdapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } | Select-Object IPAddress, InterfaceAlias
if ($networkAdapters) {
    Write-Host "   你的电脑IP地址:" -ForegroundColor Cyan
    foreach ($adapter in $networkAdapters) {
        Write-Host "   - $($adapter.IPAddress) ($($adapter.InterfaceAlias))" -ForegroundColor White
    }
} else {
    Write-Host "   未找到局域网IP地址" -ForegroundColor Red
}
Write-Host ""

# 扫描常见IP段
Write-Host "3. 扫描同一网段寻找Mac..." -ForegroundColor Yellow
Write-Host "   (这可能需要几分钟，请耐心等待)" -ForegroundColor Gray

$myIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -ExpandProperty IPAddress
if ($myIPs) {
    $baseIP = ($myIPs[0] -split '\.')[0..2] -join '.'
    Write-Host "   扫描网段: $baseIP.0/24" -ForegroundColor Cyan
    
    $foundHosts = @()
    $jobs = @()
    
    # 扫描前50个IP（加速）
    for ($i = 1; $i -le 50; $i++) {
        $targetIP = "$baseIP.$i"
        $job = Start-Job -ScriptBlock {
            param($ip)
            $result = Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue
            if ($result) {
                try {
                    # 尝试SSH连接（快速超时）
                    $sshTest = & ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no mac@$ip "echo 'SSH_OK'" 2>&1
                    if ($sshTest -like "*SSH_OK*") {
                        return $ip
                    }
                } catch {
                    # 忽略错误
                }
            }
            return $null
        } -ArgumentList $targetIP
        $jobs += $job
        
        # 每10个检查一次结果
        if ($jobs.Count -ge 10) {
            foreach ($job in $jobs) {
                $result = Receive-Job -Job $job
                if ($result) {
                    $foundHosts += $result
                }
                Remove-Job -Job $job
            }
            $jobs = @()
        }
    }
    
    # 等待剩余任务
    $jobs | Wait-Job | Out-Null
    foreach ($job in $jobs) {
        $result = Receive-Job -Job $job
        if ($result) {
            $foundHosts += $result
        }
        Remove-Job -Job $job
    }
    
    if ($foundHosts.Count -gt 0) {
        Write-Host ""
        Write-Host "   ✓ 找到可SSH连接的Mac:" -ForegroundColor Green
        foreach ($host in $foundHosts) {
            Write-Host "   - $host" -ForegroundColor Green
        }
        Write-Host ""
        
        # 询问是否更新配置
        $newIP = $foundHosts[0]
        Write-Host "是否要更新SSH配置为: $newIP ? (Y/N)" -ForegroundColor Yellow
        $response = Read-Host
        if ($response -eq 'Y' -or $response -eq 'y') {
            $configPath = "$env:USERPROFILE\.ssh\config"
            $configContent = Get-Content $configPath -Raw
            $newConfig = $configContent -replace $oldIP, $newIP
            Set-Content -Path $configPath -Value $newConfig
            Write-Host "✓ SSH配置已更新为: $newIP" -ForegroundColor Green
            Write-Host ""
            Write-Host "现在可以尝试连接: ssh $newIP" -ForegroundColor Cyan
        }
    } else {
        Write-Host "   ✗ 未找到可SSH连接的Mac" -ForegroundColor Red
        Write-Host ""
        Write-Host "建议:" -ForegroundColor Yellow
        Write-Host "1. 确保Mac已开机并连接到同一WiFi" -ForegroundColor White
        Write-Host "2. 在Mac上查看IP地址:" -ForegroundColor White
        Write-Host "   - 打开 系统设置 > 网络" -ForegroundColor Gray
        Write-Host "   - 或运行: ifconfig | grep 'inet '" -ForegroundColor Gray
        Write-Host "3. 手动更新SSH配置（见下方说明）" -ForegroundColor White
    }
} else {
    Write-Host "   无法确定网段，请手动检查Mac的IP地址" -ForegroundColor Red
}
Write-Host ""

# 显示手动更新方法
Write-Host "4. 手动更新SSH配置方法:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   方法1: 使用此脚本的快捷方式" -ForegroundColor Cyan
Write-Host "   1) 在Mac上查看新IP地址" -ForegroundColor White
Write-Host "   2) 运行以下命令（替换NEW_IP为新IP）:" -ForegroundColor White
Write-Host "      `$newIP = 'NEW_IP'" -ForegroundColor Gray
Write-Host "      `$config = Get-Content `$env:USERPROFILE\.ssh\config -Raw" -ForegroundColor Gray
Write-Host "      `$config -replace '$oldIP', `$newIP | Set-Content `$env:USERPROFILE\.ssh\config" -ForegroundColor Gray
Write-Host ""
Write-Host "   方法2: 直接编辑配置文件" -ForegroundColor Cyan
Write-Host "   1) 打开: $env:USERPROFILE\.ssh\config" -ForegroundColor White
Write-Host "   2) 将所有 $oldIP 替换为Mac的新IP地址" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan



