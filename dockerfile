FROM eclipse-temurin:17-jdk-alpine

WORKDIR /app

# Download EaglercraftXBungee
RUN wget -O eaglercraftxbungee.jar https://github.com/ayunami2000/eaglercraftxbungee/releases/download/latest/eaglercraftxbungee.jar

# Create config
COPY config.yml .

CMD ["java", "-Xmx512m", "-jar", "eaglercraftxbungee.jar"]
