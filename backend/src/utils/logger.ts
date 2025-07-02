import { createWriteStream, WriteStream } from 'fs'
import { join } from 'path'
import { mkdir } from 'fs/promises'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private logLevel: LogLevel
  private logFile: WriteStream | null = null
  private isDevelopment: boolean

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production'
    this.logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO
    
    if (!this.isDevelopment) {
      this.initializeLogFile()
    }
  }

  private async initializeLogFile(): Promise<void> {
    try {
      const logDir = join(process.cwd(), 'logs')
      await mkdir(logDir, { recursive: true })
      
      const logFileName = `app-${new Date().toISOString().split('T')[0]}.log`
      const logPath = join(logDir, logFileName)
      
      this.logFile = createWriteStream(logPath, { flags: 'a' })
    } catch (error) {
      console.error('Failed to initialize log file:', error)
    }
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString()
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : ''
    
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`
  }

  private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
    if (level < this.logLevel) {
      return
    }

    const formattedMessage = this.formatMessage(levelName, message, ...args)
    
    // Console output with colors in development
    if (this.isDevelopment) {
      const colorCodes = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
        RESET: '\x1b[0m'   // Reset
      }
      
      console.log(`${colorCodes[levelName as keyof typeof colorCodes] || colorCodes.RESET}${formattedMessage}${colorCodes.RESET}`)
    } else {
      console.log(formattedMessage)
    }

    // File output in production
    if (this.logFile && !this.isDevelopment) {
      this.logFile.write(formattedMessage + '\n')
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, ...args)
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', message, ...args)
  }

  // Cleanup method to close file streams
  close(): void {
    if (this.logFile) {
      this.logFile.end()
      this.logFile = null
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export class for testing
export { Logger }