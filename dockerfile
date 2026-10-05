# Node.js 24
FROM node:24

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero los archivos de dependencias
COPY package.json package-lock.json ./

# Instalamos exactamente las dependencias del package-lock.json
RUN npm ci

# Copiamos el resto del proyecto
COPY . .

# Gulp queda ejecutándose y observando cambios
CMD ["npm", "run", "dev"]
