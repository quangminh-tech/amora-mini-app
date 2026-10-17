FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ backend/
COPY database/ database/
# Restore after copying source so host-generated NuGet paths cannot overwrite it.
RUN rm -rf backend/bin backend/obj \
    && dotnet restore backend/Amora.Api.csproj \
    && dotnet publish backend/Amora.Api.csproj -c Release -o /out --no-restore
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
RUN mkdir /app/uploads && chown app:app /app/uploads
ENV ASPNETCORE_HTTP_PORTS=8080
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet","Amora.Api.dll"]
